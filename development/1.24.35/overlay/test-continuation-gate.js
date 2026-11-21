// The "continue your previous chat?" question appears only after startup finished and before any real request.
const assert=require('node:assert/strict');const R=require('./core/reliability.js');
const base={editor:true,started:true,starting:false,startupOwner:0,conversationKey:'/c/x',realRequest:false};
assert.equal(R.continuationScene(base),true,'after "PlazCode is ready." with only startup turns');
assert.equal(R.continuationScene({...base,started:false}),false,'before startup finishes');
assert.equal(R.continuationScene({...base,starting:true}),false,'while startup is running');
assert.equal(R.continuationScene({...base,startupOwner:3}),false,'while a startup send is still owned');
assert.equal(R.continuationScene({...base,conversationKey:''}),false,'no conversation yet');
assert.equal(R.continuationScene({...base,editor:false}),false,'no composer');
assert.equal(R.continuationScene({...base,realRequest:true}),false,'once the user sent a real request');
assert.equal(R.continuationScene(),false,'no state');
console.log('Continuation gate: shows only after startup and before the first real request.');
