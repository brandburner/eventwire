'use strict';
const $=id=>document.getElementById(id), pages=window.PILOT, measureCatalogue=window.MWP_MEASURES;
const measureNames=new Map(measureCatalogue.map(m=>[m.id,m.label]));
let pageIndex=Math.max(0,pages.findIndex(p=>p.id===new URLSearchParams(location.search).get('page'))),sectionIndex=0,view='read',saved={},activePanel=null,comparisonSide='after';
const storageKey='mwp-draft-pilot-publication-day-v2-'+pages.map(p=>p.sha256.slice(0,8)).join('-');
try{const previousKey='mwp-draft-pilot-publication-day-v2-'+pages.slice(0,3).map(p=>p.sha256.slice(0,8)).join('-');saved=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,58).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,57).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,47).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,39).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,35).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,29).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,23).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem('mwp-draft-pilot-publication-day-v2-'+pages.slice(0,15).map(p=>p.sha256.slice(0,8)).join('-'))||localStorage.getItem(previousKey)||'{}')}catch(e){saved={}}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clean(html){const d=new DOMParser().parseFromString(html,'text/html');const allowed=new Set(['P','H2','H3','H4','UL','OL','LI','A','STRONG','EM','B','I','BR','DIV','SPAN','ABBR','BLOCKQUOTE','TABLE','THEAD','TBODY','TR','TH','TD','CAPTION']);for(const el of [...d.body.querySelectorAll('*')]){if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG'].includes(el.tagName)){el.remove();continue}if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}for(const a of [...el.attributes]){if(!((el.tagName==='A'&&a.name==='href')||(el.tagName==='ABBR'&&a.name==='title')||(['TD','TH'].includes(el.tagName)&&['colspan','rowspan','scope'].includes(a.name))))el.removeAttribute(a.name)}if(el.tagName==='A'){const href=el.getAttribute('href')||'';if(href.startsWith('/'))el.setAttribute('href','https://www.gov.uk'+href);else if(!/^https?:\/\//.test(href))el.removeAttribute('href');el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}}return d.body.innerHTML}
function current(){return pages[pageIndex]}function section(){return current().sections[sectionIndex]}function state(){return saved[current().id]||(saved[current().id]={edits:{},notes:'',status:'Not reviewed'})}function draftFor(s){const st=state();if(st.edits[s.slug]!==undefined)return st.edits[s.slug];let html=s.after;if(st.editorialMode!==false){for(const e of current().editorialEdits||[]){if(e.chapter===s.slug&&(st.editorialSelected||[]).includes(e.id)){if(!html.includes(e.original))throw Error('Editorial anchor no longer matches');html=html.replace(e.original,e.replacement)}}}return html}function after(){return draftFor(section())}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(saved));$('status').textContent='Saved on this device.';return true}catch(e){$('status').textContent='Browser storage is unavailable. Download your draft before leaving.';return false}}
function blocks(s){let d=new DOMParser().parseFromString(clean(s),'text/html');return [...d.body.children].map(x=>x.outerHTML)}
function diff(a,b){let x=blocks(a),y=blocks(b),dp=Array.from({length:x.length+1},()=>Array(y.length+1).fill(0));for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)dp[i][j]=x[i]===y[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);let i=0,j=0,o='';while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){o+=x[i];i++;j++}else if(j<y.length&&(i===x.length||dp[i][j+1]>=dp[i+1][j]))o+='<ins>'+y[j++]+'</ins>';else o+='<del>'+x[i++]+'</del>'}return o}
function chapterState(s, draft) {
 const same=clean(s.before)===clean(draft), manual=state().edits[s.slug]!==undefined;
 if(manual)return {same,label:same?'Your saved wording matches the source':'Your saved wording differs',note:'The draft includes your saved chapter edits. These take precedence over the supplied proposal.'};
 if(same)return {same,label:'Original wording retained',note:'No wording change is included in this chapter. This is not confirmation that the chapter is error-free or approved.'};
 return {same,label:'Wording changes proposed',note:'Review the proposed wording and the evidence before deciding whether to use it.'};
}
function refreshChapterState(){
 const result=chapterState(section(),after());
 if($('changeCount').textContent!==result.label)$('changeCount').textContent=result.label;
 if($('chapterNotice').textContent!==result.note)$('chapterNotice').textContent=result.note;
 return result;
}
function renderContent(){
 const s=section(),a=after(),result=refreshChapterState();
 document.querySelector('.workspace').classList.toggle('comparing',view==='compare');
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 $('chapterTitle').textContent=s.title;
 $('prevChapter').disabled=sectionIndex===0;
 $('nextChapter').disabled=sectionIndex===current().sections.length-1;
 $('chapterPosition').textContent=(sectionIndex+1)+' of '+current().sections.length;
 refreshReviewTools();
 if(view==='read')$('content').innerHTML='<div class="document">'+clean(a)+'</div>';
 else if(view==='compare'){
  $('content').innerHTML='<div class="comparison-guide"><p class="comparison-wide">Before and after are shown side by side.</p><div class="comparison-narrow"><p>Choose a version to read. Both versions are available.</p><div role="group" aria-label="Comparison version"><button id="compareBefore" aria-pressed="'+(comparisonSide==='before')+'" aria-controls="comparisonBefore">Before</button><button id="compareAfter" aria-pressed="'+(comparisonSide==='after')+'" aria-controls="comparisonAfter">After</button></div></div></div><div id="comparisonColumns" class="columns" data-side="'+comparisonSide+'"><section id="comparisonBefore" class="column comparison-before" aria-labelledby="beforeTitle"><h2 id="beforeTitle">Before · captured page</h2><div class="document">'+clean(s.before)+'</div></section><section id="comparisonAfter" class="column comparison-after" aria-labelledby="afterTitle"><h2 id="afterTitle">After · proposed wording</h2><div class="document">'+clean(a)+'</div></section></div>';
  for(const side of ['before','after'])$('compare'+(side==='before'?'Before':'After')).onclick=()=>{
   comparisonSide=side;
   $('comparisonColumns').dataset.side=side;
   $('compareBefore').setAttribute('aria-pressed',String(side==='before'));
   $('compareAfter').setAttribute('aria-pressed',String(side==='after'));
  };
 }else if(view==='draft'){
  $('content').innerHTML='<p class="no-change">Edit this chapter. Your changes save in this browser and are included when you copy or download the draft.</p><div id="editor" class="document" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Edit proposed chapter">'+clean(a)+'</div>';
  $('editor').addEventListener('input',()=>{state().edits[s.slug]=clean($('editor').innerHTML);persist();refreshChapterState()});
  $('editor').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});
 }else $('content').innerHTML=(result.same?'<p class="no-change">The two versions match. The retained chapter is shown below.</p>':'<p class="legend"><span class="removed">Removed wording</span><span class="added">Added wording</span></p>')+'<div class="document">'+(result.same?clean(a):diff(s.before,a))+'</div>';
}

function render(){const p=current();renderQueue();$('queueTotal').textContent=pages.length;$('sourceLink').href=p.url;$('draftStatus').textContent=p.releaseBasis==='policy_intent'?'Draft held · policy details unresolved':p.releaseBasis==='conditional_commencement'?'Draft held · commencement checks outstanding':p.sections.some(s=>s.before!==s.after)?'Unapproved draft':'No supplied policy amendment';$('pageSummary').textContent=queueLabel(p)+(p.releaseBasis?' · Publication date not confirmed':'')+(p.publicationDate?' · For '+formatDate(p.publicationDate):'');$('checksShortcut').textContent=p.blockers.length+' checks before publication';$('position').textContent='Page '+(pageIndex+1)+' of '+pages.length;$('prev').disabled=pageIndex===0;$('next').disabled=pageIndex===pages.length-1;$('measure').textContent=p.measure;$('measureSummary').textContent='MWP measures: '+((p.measureIds||[]).map(id=>id+' · '+measureNames.get(id)).join('; ')||'Unassigned / outside scope');$('title').textContent=p.title;$('summary').textContent=p.summary;$('decisionTitle').textContent=p.decision;$('rationale').textContent=p.rationale;$('meta').innerHTML='<a href="'+p.url+'" target="_blank" rel="noopener">Open GOV.UK source ↗</a> · Captured '+escape(new Date(p.captured).toLocaleString('en-GB'))+'<br><strong>'+ (p.publicationDate?'Intended go-live: '+escape(p.publicationDate)+' · written as current on that date':(p.triage&&p.triage.reviewedRoute!=='no_change'?'No policy publication date set · draft held':'No publication scheduled · no change proposed'))+'</strong>'+ (p.publicationNote?'<br>'+escape(p.publicationNote):'')+'<br>API public-updated timestamp: '+escape(p.updated)+' (not the capture date)';$('evidence').innerHTML='<p>'+escape(p.evidenceNote)+'</p>'+(p.measureMappingNote?'<p>'+escape(p.measureMappingNote)+'</p>':'')+'<ul>'+p.sources.map(s=>'<li><a href="'+s.file+'">Source '+escape(s.name)+'</a> · <a href="'+s.url+'" target="_blank" rel="noopener">Original source</a></li>').join('')+'</ul><div class="blocker"><strong>Before publication</strong><ul>'+p.blockers.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></div>';if(p.additionalReviews){$('evidence').innerHTML+=p.additionalReviews.map(r=>'<details class="review-detail"><summary>Additional review: '+escape(r.scope)+'</summary><p>'+escape(r.reason)+'</p><ul>'+r.questions.map(q=>'<li>'+escape(q)+'</li>').join('')+'</ul>'+(r.futureEdits||[]).map(e=>'<details><summary>Future amendment · not merged with this draft</summary><p>'+escape(e.rationale||'Separate proposal for a later release; requires review.')+'</p><h4>Proposed wording</h4>'+readableEvidence(e.replacement)+'</details>').join('')+'<a href="'+escape(r.report)+'">Read the full assessment</a></details>').join('')};$('section').innerHTML=p.sections.map((s,i)=>'<option value="'+i+'">'+escape(s.title)+(s.before!==s.after?' · supplied edit':'')+'</option>').join('');$('section').value=sectionIndex;$('notes').value=state().notes;$('reviewState').value=state().status;$('status').textContent='';renderTriage();renderEditorial();renderScenarios();filterQueue();renderContent()}
function navigate(i,fromUser=true){pageIndex=i;sectionIndex=Math.max(0,current().sections.findIndex(s=>s.slug===current().initialSection));render();const active=$('queue').querySelector('[aria-current=page]');if(active)$('queue').scrollTop=Math.max(0,active.offsetTop-$('queue').offsetTop-80);const url=new URL(location.href);url.searchParams.set('page',current().id);history.replaceState(null,'',url);if(fromUser){$('pageQueue').classList.remove('queue-open');$('toggleQueue').setAttribute('aria-expanded','false');$('title').focus({preventScroll:true});window.scrollTo(0,0);}}
$('prev').onclick=()=>navigateQueue(-1);$('next').onclick=()=>navigateQueue(1);$('section').onchange=e=>{sectionIndex=Number(e.target.value);renderContent()};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;renderContent()});$('notes').oninput=e=>{state().notes=e.target.value;persist()};$('reviewState').onchange=e=>{state().status=e.target.value;persist()};$('reset').onclick=()=>{if(confirm('Remove your saved edits to this chapter and restore the supplied wording? Your notes and review status will be kept.')){delete state().edits[section().slug];const stored=persist();renderContent();if(stored)$('status').textContent='Saved chapter edits removed. Your notes and review status are unchanged.'}};
$('copy').onclick=async()=>{const html=clean(after()),d=new DOMParser().parseFromString(html,'text/html');const plain=d.body.innerText||d.body.textContent;try{if(navigator.clipboard.write&&window.ClipboardItem)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);else await navigator.clipboard.writeText(plain);$('status').textContent='Chapter copied. This is an unapproved review draft.'}catch(e){$('status').textContent='Clipboard access was denied. Use Download guide, or select and copy the draft text.'}};
$('download').onclick=()=>{let p=current(),html='<!doctype html><html lang="en"><meta charset="utf-8"><title>'+escape(p.title)+' — draft</title><h1>'+escape(p.title)+'</h1><p>Unapproved review draft. Intended publication: '+escape(p.publicationDate||(p.releaseBasis==='policy_intent'?'Policy-intent draft — regulations and commencement unconfirmed; release blocked':p.releaseBasis==='conditional_commencement'?'Commencement date unconfirmed — release blocked':'No publication date set'))+'. Captured source: '+escape(p.captured)+'. Scope: '+escape(p.measure)+'.</p><h2>Publication checks</h2><ul>'+p.blockers.map(b=>'<li>'+escape(b)+'</li>').join('')+'</ul>'+p.sections.map(s=>'<h2>'+escape(s.title)+'</h2>'+clean(draftFor(s))).join('')+'</html>';let u=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');a.href=u;a.download=p.id+'-review-draft.html';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);$('status').textContent='Downloaded the complete guide with publication checks.'};

function queueSelection(){return DraftQueue.select(pages,{query:$('queueFilter').value,topic:$('topicFilter').value,measure:$('measureFilter').value,catalogue:measureCatalogue,decision:$('decisionFilter').value,sort:$('queueSort').value})}
function renderQueue(){
 const indices=queueSelection();
 $('queue').innerHTML=indices.map(i=>'<button class="'+(i===pageIndex?'active':'')+'" '+(i===pageIndex?'aria-current="page"':'')+' data-page="'+i+'">'+escape(pages[i].title)+'<small>'+escape((pages[i].measureIds||[]).join(' · ')||'Unassigned')+'</small><small>'+escape(DraftQueue.labels[DraftQueue.group(pages[i])])+' · '+escape(queueLabel(pages[i]))+'</small></button>').join('');
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(Number(b.dataset.page)));
 $('queueCount').textContent=indices.length+' of '+pages.length+' pages';
 $('queueEmpty').hidden=indices.length!==0;
 $('clearFilters').hidden=!($('queueFilter').value||$('topicFilter').value||$('measureFilter').value||$('decisionFilter').value);
 const pos=indices.indexOf(pageIndex);
 $('position').textContent=pos<0?'Current page is outside these filters':'Page '+(pos+1)+' of '+indices.length;
 $('prev').disabled=pos<=0;
 $('next').disabled=pos<0||pos===indices.length-1;
}
function filterQueue(){renderQueue()}
function navigateQueue(delta){const indices=queueSelection(),pos=indices.indexOf(pageIndex);if(pos>=0&&indices[pos+delta]!==undefined)navigate(indices[pos+delta])}
function changeFilters(){
 const indices=queueSelection();
 if(indices.length&&!indices.includes(pageIndex))navigate(indices[0],false);else renderQueue();
 const url=new URL(location.href);for(const [key,id] of [['topic','topicFilter'],['measure','measureFilter'],['decision','decisionFilter'],['sort','queueSort']]){if($(id).value)url.searchParams.set(key,$(id).value);else url.searchParams.delete(key)}history.replaceState(null,'',url);
}
$('queueFilter').oninput=changeFilters;
for(const id of ['topicFilter','measureFilter','decisionFilter','queueSort'])$(id).onchange=changeFilters;
$('clearFilters').onclick=()=>{for(const id of ['queueFilter','topicFilter','measureFilter','decisionFilter'])$(id).value='';changeFilters()};

function renderScenarios(){const p=current();if(!p.scenarios){$('scenarios').innerHTML='';return}const st=state();st.scenarios=st.scenarios||{};$('scenarios').innerHTML='<details><summary>Scenario checks · '+p.scenarios.length+' situations to review</summary><p>These are expected outcomes for human review, not automated legal verdicts. Check the whole proposed page, including unchanged passages.</p>'+p.scenarios.map((s,i)=>'<div class="scenario"><h3>'+escape(s.situation)+'</h3><p>'+escape(s.expected)+'</p><label for="scenario-'+i+'">Reviewer assessment</label><select id="scenario-'+i+'" data-scenario="'+i+'"><option>Not reviewed</option><option>Draft handles this</option><option>Needs revision</option><option>Needs policy input</option></select></div>').join('')+'<p><a href="change-packs.json">Reusable change packs and evidence scope</a></p></details>';document.querySelectorAll('[data-scenario]').forEach(el=>{el.value=st.scenarios[el.dataset.scenario]||'Not reviewed';el.onchange=()=>{st.scenarios[el.dataset.scenario]=el.value;persist()}})}

function readableEvidence(quote){
  if(/^\s*<(p|li|ul|ol|div|h[2-4]|table)\b/i.test(quote)){
    const fragment=clean(quote);
    return /^\s*<li\b/i.test(quote)?'<ul>'+fragment+'</ul>':fragment;
  }
  if(/^\s*<P1group\b/.test(quote)){
    const status=quote.match(/Status="([^"]+)"/),extent=quote.match(/RestrictExtent="([^"]+)"/);
    return '<p>'+escape([status?'Recorded status: '+status[1]:'',extent?'Extent: '+extent[1]:''].filter(Boolean).join(' · '))+'</p>';
  }
  return '<p>'+escape(quote.replace(/<\/?(?:p|li|ul|ol|strong|em|span|a)\b[^>]*>/gi,''))+'</p>';
}
function renderTriage(){
  const p=current(),t=p.triage;
  if(!t){$('triage').innerHTML='';return}
  const labels={no_change:'No change proposed in reviewed scope',bounded_edit:'Ready for a bounded edit',connected_change:'Related rules need review',unresolved:'More evidence needed'};
  const label=r=>labels[r]||r.replaceAll('_',' ');
  const grouped=new Map();
  for(const e of t.evidence){if(!grouped.has(e.source_file))grouped.set(e.source_file,[]);grouped.get(e.source_file).push(e.exact_quote)}
  const sources=[...grouped].map(([file,quotes])=>{
    const basename=file.split('/').pop();
    const source=(p.sources||[]).find(x=>x.file.split('/').pop()===basename);
    const related=pages.find(x=>x.id===basename.replace(/\.(json|xml)$/,''));
    const title=related?related.title:basename.replace(/\.(json|xml)$/,'').replaceAll('-', ' ').replaceAll('__',' / ');
    const href=source?source.file:null;
    return '<section class="evidence-group"><div class="evidence-source"><h4>'+escape(title)+'</h4>'+(href?'<a href="'+escape(href)+'" target="_blank" rel="noopener">Open original source ↗</a>':'')+'</div><div class="evidence-excerpts">'+quotes.map(q=>'<blockquote>'+readableEvidence(q)+'</blockquote>').join('')+'</div></section>';
  }).join('');
  $('triage').innerHTML='<details class="review-note"><summary>Review decision</summary><div class="review-outcome"><strong>'+escape(label(t.reviewedRoute))+'</strong><span>'+ (t.reviewMode==='single'?'Single-agent source review · human review pending':t.originalRoute===t.reviewedRoute?'Initial triage and second review agree':'Decision refined during second review')+'</span></div><p class="review-reason">'+escape(t.reason)+'</p><details class="review-detail"><summary>Evidence behind the decision <span class="evidence-count">'+t.evidence.length+' excerpts</span></summary><p class="review-scope"><strong>Scope of this check</strong><br>'+escape(t.scope)+'</p>'+sources+'</details>'+(t.triggers.length?'<details class="review-detail"><summary>When to review this again</summary><ul class="review-triggers">'+t.triggers.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></details>':'')+'<details class="review-detail technical"><summary>Technical record</summary><p>Initial triage: '+escape(t.model)+' · '+escape(label(t.originalRoute))+(t.reviewMode==='single'?'<br>No independent second review': '<br>Second review: '+escape(label(t.reviewedRoute))+' (reviewing agent; not human policy approval)')+'</p>'+[...grouped].map(([file,quotes])=>'<p class="source-path">'+escape(file)+'</p><pre class="quote">'+escape(quotes.join('\n\n'))+'</pre>').join('')+'<a href="'+escape(p.reviewReport||'review-records.json')+'">Review records and measurement limits</a></details></details>';
}

function renderEditorial(){
 const p=current(),edits=p.editorialEdits||[];
 if(!p.editorialReview){$('editorial').innerHTML='<p>No optional writing review is recorded for this page.</p>';return}
 const st=state();st.editorialSelected=st.editorialSelected||[];
 const selected=st.editorialSelected.length;
 $('editorial').innerHTML='<details open><summary>Optional writing corrections · '+(p.editorialReview.outOfScope?'outside scope':edits.length+' proposed')+'</summary>'+ (p.editorialReview.note?'<p>'+escape(p.editorialReview.note)+'</p>':'')+'<p>These suggestions address the writing standards. They do not approve the policy content. Choose corrections to include in the draft; copying and downloads use your selection.</p><p><a href="style-audit.html">See style findings across pages, grouped by type</a></p><div class="editorial-toolbar" role="group" aria-label="Draft content"><button id="policyOnly" aria-pressed="'+(st.editorialMode===false)+'">Policy changes only</button><button id="withEditorial" aria-pressed="'+(st.editorialMode!==false)+'">Policy + selected corrections</button><span>'+selected+' selected</span></div>'+edits.map((e,i)=>'<article class="editorial-patch"><label class="editorial-choice"><input type="checkbox" data-edit="'+escape(e.id)+'" '+(st.editorialSelected.includes(e.id)?'checked':'')+'> Include correction '+(i+1)+'</label><button class="correction-chapter" data-chapter="'+escape(e.chapter)+'">In '+escape(p.sections.find(s=>s.slug===e.chapter).title)+'</button><p><strong>'+'<a href="writing-standards.html#section-'+e.standardSection+'">'+escape(e.styleType)+'</a>'+'</strong> · '+escape(e.reason)+'</p><div class="editorial-comparison"><div><h4>Captured wording</h4>'+readableEvidence(e.original)+'</div><div><h4>Proposed wording</h4>'+readableEvidence(e.replacement)+'</div></div></article>').join('')+(!edits.length?'<p>No isolated, meaning-preserving corrections proposed.</p>':'')+(p.editorialReview.flagged.length?'<details class="review-detail"><summary>Improvements needing more review</summary><ul>'+p.editorialReview.flagged.map(x=>'<li>'+escape(x.reason)+'<blockquote>'+escape(x.passage)+'</blockquote></li>').join('')+'</ul></details>':'')+'<p><a href="writing-standards.html">Writing standards used for this batch</a></p></details>';
 document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{sectionIndex=current().sections.findIndex(s=>s.slug===b.dataset.chapter);$('section').value=sectionIndex;renderContent()});
 const canChange=()=>{if(Object.keys(st.edits).length){$('status').textContent='This page has manual draft edits. Download them, then reset the edited chapters before changing the included corrections.';return false}return true};
 const refresh=()=>{persist();renderEditorial();renderContent()};
 $('policyOnly').onclick=()=>{if(canChange()){st.editorialMode=false;refresh()}};
 $('withEditorial').onclick=()=>{if(canChange()){st.editorialMode=true;refresh()}};
 document.querySelectorAll('[data-edit]').forEach(el=>el.onchange=()=>{if(!canChange()){el.checked=!el.checked;return}st.editorialSelected=el.checked?[...st.editorialSelected,el.dataset.edit]:st.editorialSelected.filter(x=>x!==el.dataset.edit);st.editorialMode=true;refresh()});
}

function formatDate(value){return new Date(value+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
function queueLabel(p){const count=p.sections.filter(s=>s.before!==s.after).length;return count?(count===1?'1 chapter has supplied edits':count+' chapters have supplied edits'):(p.triage&&p.triage.reviewedRoute!=='no_change'?'Policy review needed':'No change proposed in reviewed scope')}
function refreshReviewTools(){const p=current(),st=state(),n=(p.editorialEdits||[]).length,selected=(st.editorialSelected||[]).length;$('writingTool').textContent='Writing suggestions'+(n?' ('+n+')':'');$('selectionSummary').textContent=selected?(st.editorialMode===false?'Selected writing corrections hidden':selected+' writing correction'+(selected===1?'':'s')+' included'):'';}
function showPanel(name,focusPanel=false){activePanel=name;const open=!!name;$('reviewPanel').hidden=!open;document.querySelector('.workspace').classList.toggle('panel-open',open);for(const key of ['writing','evidence','notes'])$('panel-'+key).hidden=key!==name;document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.panel===name)));if(open)$('panelTitle').textContent={writing:'Writing suggestions',evidence:'Evidence and publication checks',notes:'Your review notes'}[name];if(open&&focusPanel)$('closePanel').focus();}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>showPanel(activePanel===b.dataset.panel?null:b.dataset.panel,true));
$('closePanel').onclick=()=>{const trigger=document.querySelector('.review-tools [data-panel="'+activePanel+'"]');showPanel(null);if(trigger)trigger.focus()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&activePanel)$('closePanel').click()});
$('toggleQueue').onclick=()=>{const open=$('pageQueue').classList.toggle('queue-open');$('toggleQueue').setAttribute('aria-expanded',String(open))};
function changeChapter(delta){sectionIndex+=delta;renderContent();$('section').value=sectionIndex;$('content').focus();}
$('prevChapter').onclick=()=>changeChapter(-1);$('nextChapter').onclick=()=>changeChapter(1);
if(location.hash==='#editorial')showPanel('writing');

$('checksShortcut').onclick=()=>{showPanel('evidence',true);$('evidence').parentElement.open=true;};

const initialTopic=new URLSearchParams(location.search).get('topic');
if([...$('topicFilter').options].some(o=>o.value===initialTopic))$('topicFilter').value=initialTopic;
$('measureFilter').innerHTML='<option value="">All measures</option>'+measureCatalogue.map(m=>'<option value="'+escape(m.id)+'">'+escape(m.id+' · '+m.label)+' ('+pages.filter(p=>(p.measureIds||[]).includes(m.id)).length+')</option>').join('')+'<option value="unassigned">Unassigned / outside scope ('+pages.filter(p=>!(p.measureIds||[]).length).length+')</option>';
const initialParams=new URLSearchParams(location.search),initialMeasure=initialParams.get('measure');
if(initialMeasure==='unassigned'||measureNames.has(initialMeasure))$('measureFilter').value=initialMeasure;
const initialSort=initialParams.get('sort');if(['review','measure','title','newest'].includes(initialSort))$('queueSort').value=initialSort;
const initialDecision=initialParams.get('decision');if(Object.hasOwn(DraftQueue.labels,initialDecision))$('decisionFilter').value=initialDecision;
const initialSelection=queueSelection();
if(initialSelection.length&&(!pages.some(p=>p.id===initialParams.get('page'))||!initialSelection.includes(pageIndex)))pageIndex=initialSelection[0];
navigate(pageIndex,false);
