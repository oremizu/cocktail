// 警告
// title-head間で読み込む
function _assert(desc, v){
    if(v){
        return;
    }
    else{
        let caller = _assert.caller || 'Top level';
        console.error('ASSERT in %s, %s is :', caller, desc, v);
    }
}