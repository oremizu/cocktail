// 主処理
let localVideo = document.getElementById('local_video');
let localStream = null;
let peerConnections = [];
let remoteStreams = [];
let remoteVideos = [];
const MAX_CONNECTION_COUNT = 5;
let container = document.getElementById('container');
_assert('container', container);
const dataDebugFlag = true;
let room = getRoomName();
// firestore接続
firebase.initializeApp({
    apiKey: 'AIzaSyDfqTc9sttX11txQOLInjSqIdcIH-EhTs0',
    authDomain: 'webrtc-23654.firebaseapp.com',
    projectId: 'webrtc-23654'
}
);
let database = firebase.firestore();
let dbRoot = database.collection("users").doc(room)
let roomBroadcastRef;
let clientRef;
let clientId;
// デバッグ用
let debugmsg;
// 
joinRoom(room);
setRoomLink(room);

// 部屋作成系
function joinRoom(room){
    console.log('joinRoom(room): join room name: '+ room);
    let key = dbRoot.collection("_join_").doc().id;
    dbRoot.collection("_join_").doc(key).set({joined:'unknown'});
    clientId = 'member_'+ key;
    console.log('joinRoom(room): joined to room: '+ room+ ': as clientId: '+ clientId);
    dbRoot.collection("_join_").doc(key).update({joined:clientId});
    // remove join object
    if(!dataDebugFlag){
        console.log('joinRoom(room): dataDebugFlag is False');
        let joinRef = dbRoot.collection("_join_").doc(key);
        joinRef.delete();
    }
    roomBroadcastRef = dbRoot.collection('_broadcast_');
    roomBroadcastRef.onSnapshot(function(querySnapshot){
        changeDoc = querySnapshot.docChanges();
        for(let change of querySnapshot.docChanges()){
            if(change.type==='added'){
                // データが追加された時
                console.log('roomBroadcastRef.onSnapshot: ');
                let message = change.doc.data();
                let fromId = message.from;
                if(fromId===clientId){
                    console.log('roomBroadcastRef.onSnapshot: fromId is equal to clientId, so ignore');
                    return;
                }
                if(message.type==='call me'){
                    console.log('roomBroadcastRef.onSnapshot: message.type is call me');
                    if(!isReadyToConnect()){
                        console.log('roomBroadcastRef.onSnapshot: not ready to connect, so ignore');
                        return;
                    }
                    else if(!canConnectMore()){
                        console.warn('roomBroadcastRef.onSnapshot: too many connections, so ignore');
                    }
                    if(isConnectedWith(fromId)){
                        console.log('roomBroadcastRef.onSnapshot: already connected, so ignore');
                    }
                    else{
                        console.log('roomBroadcastRef.onSnapshot: makeOffer(fromId)');
                        makeOffer(fromId);
                    }
                }
                else if(message.type==='bye'){
                    console.log('roomBroadcastRef.onSnapshot: message.type is bye');
                    if(isConnectedWith(fromId)){
                        console.log('roomBroadcastRef.onSnapshot: connection exist with fromId: '+ fromId);
                        stopConnection(fromId);
                    }
                }
            }
            else if(change.type==='modified'){
                // データが変更された時
            }
            else if(change.type==='removed'){
                // データが削除された時
            }
        }
    }
    );
    clientRef = dbRoot.collection('_direct_').doc(clientId);
    clientRef.onSnapshot(function(doc){
        console.log('clientRef.onSnapshot: ');
        let message = doc.data()
        let fromId = message.from;
        if(message.type==='offer'){
            console.log('clientRef.onSnapshot: message.type is offer: fromId: '+ fromId);
            let offer = new RTCSessionDescription(message);
            setOffer(fromId, offer);
        }
        else if(message.type==='answer'){
            console.log('clientRef.onSnapshot: message.type is answer: fromId: '+ fromId);
            let answer = new RTCSessionDescription(message);
            setAnswer(fromId, answer);
        }
        else if(message.type==='candidate'){
            console.log('clientRef.onSnapshot: message.type is candidate: fromId: '+ fromId);
            let candidate = new RTCIceCandidate(JSON.parse(message.ice));
            addIceCandidate(fromId, candidate);
        }
        if(!dataDebugFlag){
            console.log('clientRef.onSnapshot: dataDebugFlag is False');
            // let messageRef = database.ref(databaseRoot+ room+ '/_direct_/'+ clientId+ '/'+ data.key);
            let messageRef = dbRoot.collection("_direct_").doc(clientId);
            messageRef.delete();
        }    
    }
    );
}
function setRoomLink(room){
    console.log('setRoomLink(room): set room url');
    let url = document.location.href;
    let anchorLink = document.getElementById('room_link');
    anchorLink.href = url;
    let anchorMail = document.getElementById('mail_link');
    let mailtoUrl = 'mailto:?subject=invitation-of-multi-party-videochat&body='+ url;
    anchorMail.href = mailtoUrl;
}
function emitRoom(msg){
    console.log('emitRoom(msg): send message to everyone: massage.type: '+ msg.type);
    msg.from = clientId;
    roomBroadcastRef.doc("message").set(msg);
}
function emitTo(id, msg){
    console.log('emitTo(id, msg): send message from: '+ clientId+ ', to: '+ id+ ', massage.type: '+ msg.type);
    msg.from = clientId;
    dbRoot.collection("_direct_").doc(id).set(msg);
}
function clearMessage(){
    console.log('clearMessage(): initialize clientRef');
    clientRef.set({});
}
function getRoomName(){
    console.log('getRoomName(): generate room name');
    let url = document.location.href;
    let args = url.split('?');
    if(args.length>1){
        let room = args[1];
        if(room!=''){
            return room;
        }
    }
    // ルーム名を指定しない場合にランダムで生成してURLを変更
    let room = 'room_'+ getUniqueStr(); 
    window.history.pushState(null, null, 'multi_firebase_adapter.html?'+ room);
    return room;
}
function getUniqueStr(myStrong){
    console.log('getUniqueStr(myStrong): generate unique string');
    var strong = 1000;
    if(myStrong) strong = myStrong;
    return new Date().getTime().toString(16)+ Math.floor(strong*Math.random()).toString(16);
}

// 接続処理系(判定系)
function isReadyToConnect(){
    if(localStream) {
        return true;
    }
    else{
        return false;
    }
}
function getConnectionCount(){
    return peerConnections.length;
}
function canConnectMore(){
    return (getConnectionCount()<MAX_CONNECTION_COUNT);
}
function isConnectedWith(id){
    if(peerConnections[id]){
        return true;
    }
    else{
        return false;
    }
}

// 接続処理系
function addConnection(id, peer){
    _assert('addConnection(id, peer): addConnection() peer: ', peer);
    _assert('addConnection(id, peer): addConnection() peer must not exist', (!peerConnections[id]));
    console.log('addConnection(id, peer): Id: '+ id+ ", peer: "+ peer);
    peerConnections[id] = peer;
}
function getConnection(id){
    console.log('getConnection(id): connect with Id: '+ id);
    let peer = peerConnections[id];
    _assert('getConnection(id): peer must exist: ', peer);
    return peer;
}
function deleteConnection(id){
    console.log('deleteConnection(id): delete connection with Id: '+ id);
    _assert('deleteConnection(id): peer must exist: ', peerConnections[id]);
    delete peerConnections[id];
}
function stopConnection(id){
    console.log('stopConnection(id): stop connection with Id: '+ id);
    detachVideo(id);
    if(isConnectedWith(id)){
        let peer = getConnection(id);
        peer.close();
        deleteConnection(id);
    }
}
function stopAllConnection(){
    console.log('stopAllConnection(): stop all connection');
    for(let id in peerConnections){
        stopConnection(id);
    }
}

// 動画操作系
function attachVideo(id, stream){
    let video = addRemoteVideoElement(id);
    playVideo(video, stream);
    video.volume = 1.0;
}
function detachVideo(id){
    let video = getRemoteVideoElement(id);
    pauseVideo(video);
    deleteRemoteVideoElement(id);
}
function isRemoteVideoAttached(id){
    if (remoteVideos[id]){
        return true;
    }
    else{
        return false;
    }
}
function addRemoteVideoElement(id){
    _assert('addRemoteVideoElement(id): video must not exist', (!remoteVideos[id]));
    let video = createVideoElement('remote_video_'+ id);
    remoteVideos[id] = video;
    return video;
}
function getRemoteVideoElement(id){
    let video = remoteVideos[id];
    _assert('getRemoteVideoElement(id): video must exist', video);
    return video;
}
function deleteRemoteVideoElement(id){
_assert('deleteRemoteVideoElement(id): stream must exist', remoteVideos[id]);
removeVideoElement('remote_video_'+ id);
delete remoteVideos[id];
}
function createVideoElement(elementId){
    let video = document.createElement('video');
    video.width = '240';
    video.height = '180';
    video.id = elementId;
    video.style.border = 'solid black 1px';
    video.style.margin = '2px';
    container.appendChild(video);
    return video;
}
function removeVideoElement(elementId){
    let video = document.getElementById(elementId);
    _assert('removeVideoElement(elemntId): video must exist', video);
    container.removeChild(video);
    return video;
}
async function startVideo(){
    try{
        localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true}); // adapter.jsがあればChromeでも動く
        playVideo(localVideo, localStream);
    }
    catch(error){
        console.error('startVideo(): getUserMedia:', error);
    }
}
function stopVideo(){
    pauseVideo(localVideo);
    stopLocalStream(localStream);
    localStream = null;
}
function stopLocalStream(stream){
    let tracks = stream.getTracks();
    if(!tracks){
        console.warn('stopLocalStream(stream): no tracks');
        return;
    }
    for(let track of tracks){
        track.stop();
    }
}
function playVideo(element, stream){
    if('srcObject' in element){
        element.srcObject = stream;
    }
    else{
        element.src = window.URL.createObjectURL(stream);
    }
    element.play();
    element.volume = 0;
}
function pauseVideo(element){
    element.pause();
    if('srcObject' in element){
        element.srcObject = null;
    }
    else{
        if(element.src&&(element.src!=='')){
            window.URL.revokeObjectURL(element.src);
        }
        element.src = '';
    }
}


// SDP系
function sendSdp(id, sessionDescription){
    console.log('sendSdp(id, sessionDescription): send sdp');
    let message = {type:sessionDescription.type, sdp:sessionDescription.sdp};
    console.log('sendSdp(id, sessionDescription): sdp: '+ message);
    emitTo(id, message);
}
function sendIceCandidate(id, candidate){
    console.log('sendIceCandidate(id, candidate): send ICE candidate');
    let obj = {type:'candidate', ice:JSON.stringify(candidate)};
    emitTo(id, obj);
}
function prepareNewConnection(id){
    console.log('prepareNewConnection(id): prepare new connection with Id: '+ id);
    let pc_config = {"iceServers":[{"urls":"stun:stun.l.google.com:19302"}]};
    let peer = new RTCPeerConnection(pc_config);
    if('ontrack' in peer){
        console.log('prepareNewConnection(id): ontrack in peer');
        peer.ontrack = function(event){
            let stream = event.streams[0];
            console.log('prepareNewConnection(id): peer.ontrack(): stream Id: '+ stream.id);
            if(isRemoteVideoAttached(id)){
                console.log('prepareNewConnection(id): peer.ontrack(): stream already attached, so ignore');
            }
            else{
                console.log('prepareNewConnection(id): peer.ontrack(): attach stream');
                attachVideo(id, stream);
            }
        };
    }
    else{
        console.log('prepareNewConnection(id): ontrack not in peer');
        peer.onaddstream = function(event){
            let stream = event.stream;
            console.log('prepareNewConnection(id): peer.onaddstream: stream Id: '+ stream.id);
            attachVideo(id, stream);
        };
    }
    peer.onicecandidate = function(evt){
        console.log('prepareNewConnection(id): peer.onicecandidate: ');
        if(evt.candidate){
            console.log('prepareNewConnection(id): peer.onicecandidate: evt.candidate exist: '+ evt.candidate);
            sendIceCandidate(id, evt.candidate);
        }
        else{
            console.log('prepareNewConnection(id): peer.onicecandidate: peer.onicecandidate: empty ice event');
        }
    };
    peer.onnegotiationneeded = function(evt){
        console.log('prepareNewConnection(id): peeronnegotiationneeded');
    };
    peer.onicecandidateerror = function(evt){
        console.error('prepareNewConnection(id): peer.onicecandidateerror: '+ evt);
    };
    peer.onsignalingstatechange = function(){
        console.log('prepareNewConnection(id): peer.onsignalingstatechange: '+ peer.signalingState);
    };
    peer.oniceconnectionstatechange = function(){
        console.log('prepareNewConnection(id): peer.oniceconnectionstatechange: ice connection status: '+ peer.iceConnectionState);
        if(peer.iceConnectionState==='disconnected'){
            console.log('prepareNewConnection(id): peer.oniceconnectionstatechange: state is disconnected');
            stopConnection(id);
        }
    };
    peer.onicegatheringstatechange = function(){
        console.log('prepareNewConnection(id): peer.onicegatheringstatechange: ice gathering state: '+ peer.iceGatheringState);
    };
    peer.onconnectionstatechange = function(){
        console.log('prepareNewConnection(id): peer.onconnectionstatechange: '+ peer.connectionState);
    };
    peer.onremovestream = function(event){
        console.log('prepareNewConnection(id): peer.onremovestream()');
        deleteRemoteStream(id);
        detachVideo(id);
    };
    if(localStream){
        console.log('prepareNewConnection(id): add local stream');
        peer.addStream(localStream);
    }
    else{
        console.warn('prepareNewConnection(id): no local stream, but continue');
    }
    return peer;
}
async function makeOffer(id){
    _assert('makeOffer(id): makeOffer must not connected yet', (!isConnectedWith(id)));
    console.log('makeOffer(id): send answer, create remote session description');
    let peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);
    try{
        console.log('makeOffer(id): peer: '+ peerConnection)
        let offer = await peerConnection.createOffer();
        console.log('makeOffer(id): createOffer succsess');
        await peerConnection.setLocalDescription(offer);
        peerConnection.setLocalDescription(offer);
        console.log('makeOffer(id): setLocalDescription succsess');
        // TrickleICEの場合は初期SDPを相手に送る
        sendSdp(id, peerConnection.localDescription);
        // VanillaICEの場合はまだSDPは送らない
        ;
    }
    catch(error){
        console.error('makeOffer(id): error'+ error);
    }
}
async function makeAnswer(id){
    console.log('makeAnswer(id): send answer, create remote session description');
    let peerConnection = getConnection(id);
    if(!peerConnection){
        console.error('makeAnswer(id): peerConnection not exist');
        return;
    }
    try{
        console.log('makeOffer(id): peer: '+ peerConnection)
        let answer = await peerConnection.createAnswer();
        console.log('makeAnswer(id): createAnswer succsess');
        await peerConnection.setLocalDescription(answer);
        console.log('makeAnswer(id): setLocalDescription succsess');
        //TrickleICEの場合は初期SDPを相手に送る
        sendSdp(id, peerConnection.localDescription);
        //VanillaICEの場合はまだSDPは送らない
        ;        
    }
    catch(error){
        console.error('makeAnswer(id): error'+ error);
    }
}
async function setOffer(id, sessionDescription){
    _assert('setOffer must not connected yet', (!isConnectedWith(id)));
    console.log('setOffer(id, sessionDescription): ');
    let peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);
    try{
        console.log('setOffer(id, sessionDescription): peer: '+ peerConnection);
        await peerConnection.setRemoteDescription(sessionDescription); // offer(SPD情報)を相手にセット
        console.log('setOffer(id, sessionDescription): setRemoteDescription(offer) succsess in promise');
        makeAnswer(id);
    }
    catch(error){
        console.error('setOffer(sessionDescription): setRemoteDescription(offer) error:'+ error);
    }
}
async function setAnswer(id, sessionDescription){
    console.log('setAnswer(id, sessionDescription): ');
    let peerConnection = getConnection(id);
    if(!peerConnection){ // offer側にはpeerConnectionオブジェクトが存在するはず
        console.error('setAnswer(sessionDescription): peerConnection not exist');
        return;
    }
    try{
        console.log('setAnswer(id, sessionDescription): peer: '+ peerConnection);
        await peerConnection.setRemoteDescription(sessionDescription); // Answer(SPD情報)を相手にセット
        console.log('setAnswer(sessionDescription): setRemoteDescription(answer) succsess');
    }
    catch(error){
        console.error('setAnswer(sessionDescription): setRemoteDescription(answer) error:', error);
    }
}
function addIceCandidate(id, candidate){
    console.log('addIceCandidate(candidate): id: '+ id+ 'candidate: '+ candidate);
    let peerConnection = getConnection(id);
    if(peerConnection){
        console.log('addIceCandidate(candidate): set ICEcandidate peer: '+ peerConnection);
        peerConnection.addIceCandidate(candidate);
    }
    else{
        console.error('addIceCandidate(candidate): peerConnection not exist');
        return;
    }
}

// ボタン操作系
function connect(){
    if(!isReadyToConnect()){
        console.warn('connect(): not ready to connect');
    }
    else if(!canConnectMore()){
        console.log('connect(): too many connections');
    }
    else{
        console.log('connect(): callme()');
        callMe(); // シグ鯖にCallme
    }
}
function hangUp(){
    console.log('hangUp(): ');
    emitRoom({type:'bye'});  
    clearMessage(); //firebaseを初期化
    stopAllConnection();
}
function callMe(){
    console.log('callMe(): ');
    emitRoom({type:'call me'});
}
