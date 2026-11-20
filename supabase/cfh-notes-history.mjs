// Per-note history stays in memory for this app session, separate from synced note data.
export function createNoteHistory(limit=60){
 const notes=new Map();let active=null;
 function select(id,value){active=id;if(!notes.has(id))notes.set(id,{past:[],future:[],value});else record(value);}
 function current(){return notes.get(active);}
 function record(value){const state=current();if(!state||state.value===value)return;state.past.push(state.value);if(state.past.length>limit)state.past.shift();state.value=value;state.future=[];}
 function move(direction){const state=current();if(!state)return null;const from=direction==='undo'?state.past:state.future,to=direction==='undo'?state.future:state.past;if(!from.length)return null;to.push(state.value);state.value=from.pop();return state.value;}
 return {select,record,move,canUndo:()=>!!current()?.past.length,canRedo:()=>!!current()?.future.length};
}
