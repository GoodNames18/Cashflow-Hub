import test from 'node:test';
import assert from 'node:assert/strict';
import {noteContent,normalizeNoteContent,contentText,readNoteContent} from '../../supabase/cfh-notes-content.mjs';
const audio={id:'clip',type:'audio'},T=text=>({type:'text',text}),A={type:'audio',id:'clip'};
test('old notes keep both text fields and the recording on migration',()=>{
 const parts=noteContent({body:'Before',bodyAfter:'After',attachments:[audio]});
 assert.deepEqual(parts,[T('Before\n'),A,T(' After')]);
 assert.equal(contentText(parts),'Before\n After');
 assert.deepEqual(noteContent({body:'Plain\ntext'}),[T('Plain\ntext')]);
});
test('audio moved between words keeps its position through save/reopen',()=>{
 const note={attachments:[audio],content:[T('hello '),A,T(' world\nnext full-width line')]};
 assert.deepEqual(noteContent(JSON.parse(JSON.stringify(note))),note.content);
 assert.equal(contentText(noteContent(note)),'hello  world\nnext full-width line');
 assert.deepEqual(normalizeNoteContent(note.content,[]),[T('hello  world\nnext full-width line')]);
});
test('content keeps plain text, deduplicates known clips and rejects unknown media',()=>{
 assert.deepEqual(normalizeNoteContent([T('a\u200b'),T('b'),A,A,{type:'audio',id:'unknown'},{type:'html',html:'<script>'},T('<img>')],[audio]),[T('ab'),A,T('<img>')]);
});
const text=value=>({nodeType:3,nodeValue:value});
function node(tagName,children=[],dataset={}){const n={nodeType:1,tagName,childNodes:children,dataset};children.forEach((c,i)=>c.nextSibling=children[i+1]||null);return n;}
test('reading edited paragraphs preserves line breaks but excludes audio controls',()=>{
 const host=node('DIV',[text('Before '),node('SPAN',[text('Play 0:11 Delete')],{audioId:'clip'}),text(' after'),node('DIV',[text('Next line')]),node('DIV',[text('Last line')])]);
 assert.deepEqual(normalizeNoteContent(readNoteContent(host),[audio]),[T('Before '),A,T(' after\nNext line\nLast line')]);
});

test('Enter and empty paragraphs reopen without adding blank lines',()=>{
 const read=children=>contentText(readNoteContent(node('DIV',children)));
 assert.equal(read([text('a'),node('DIV',[node('BR')])]),'a\n');
 assert.equal(read([node('DIV',[text('a')]),node('DIV',[node('BR')]),node('DIV',[text('b')])]),'a\n\nb');
 assert.equal(read([text('a'),node('DIV',[text('b')])]),'a\nb');
});
