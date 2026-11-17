/* ---------- NHL CENTRAL + LIVE ACHIEVEMENTS ---------- */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const fmtTime=s=>{if(!s)return '';const d=new Date(s);return isNaN(d)?s:d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})};
 const get=async(url)=>{
  const isNhl=url.startsWith('https://api-web.nhle.com/');
  const routes=isNhl
   ? [
      'https://corsproxy.io/?url='+encodeURIComponent(url),
      'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
      'https://proxy.cors.dev/'+url,
      'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url)
     ]
   : [url];
  let lastError=null;
  for(const requestUrl of routes){
   const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
   try{
    const response=await fetch(requestUrl,{cache:'no-store',credentials:'omit',signal:c.signal});
    if(!response.ok)throw Error('Feed returned HTTP '+response.status);
    return await response.json();
   }catch(e){
    lastError=e;
   }finally{clearTimeout(t)}
  }
  if(lastError?.name==='AbortError')throw Error('NHL feed timed out through both data routes. Try again shortly.');
  if(lastError instanceof TypeError)throw Error('All NHL data routes were blocked by the browser or network. Try switching Wi-Fi/mobile data, then refresh.');
  throw lastError||Error('NHL feed unavailable.');
 };
 const nhl='https://api-web.nhle.com/v1/';
 const espn='https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/';
 let updateBusy=false,goalBusy=false,lastUpdate=0,lastGoals=0,goalCache=[],seen=new Set();
 const teamLogo=t=>'https://assets.nhle.com/logos/nhl/svg/'+encodeURIComponent(t||'NHL')+'_dark.svg';
 const playerPhoto=(p,team)=>p?.headshot|| (p?.id?'https://assets.nhle.com/mugs/nhl/'+(new Date().getMonth()>=8?new Date().getFullYear():new Date().getFullYear()-1)+(new Date().getMonth()>=8?new Date().getFullYear()+1:new Date().getFullYear())+'/'+(team||'NHL')+'/'+p.id+'.png':'');
 const gameStatus=g=>{const s=String(g.gameState||'').toUpperCase();return ['LIVE','CRIT','IN_PROGRESS'].includes(s)?'LIVE':['FINAL','OFF'].includes(s)?'FINAL':'UPCOMING'};
 const walk=(v,fn,depth=0)=>{if(!v||typeof v!=='object'||depth>8)return;if(Array.isArray(v)){v.forEach(x=>walk(x,fn,depth+1));return}fn(v);Object.values(v).forEach(x=>{if(x&&typeof x==='object')walk(x,fn,depth+1)})};
 function injuriesFrom(data){
  const out=[],seenI=new Set();
  walk(data,o=>{
   const a=o.athlete||o.player||o.person||{},name=a.displayName||a.fullName||a.name?.full||a.name||o.displayName||o.playerName;
   const status=o.status?.type?.description||o.status?.description||o.status||o.injuryStatus||o.availability||'';
   const detail=o.details?.detail||o.details?.type||o.shortComment||o.longComment||o.description||o.injury?.description||o.injury?.type||'';
   const team=o.team?.abbreviation||o.team?.displayName||o.teamAbbreviation||a.team?.abbreviation||'';
   if(typeof name==='string'&&name.length>3&&(detail||status)&&!Array.isArray(status)){
    const key=name+'|'+team+'|'+String(status)+'|'+String(detail);
    if(!seenI.has(key)){seenI.add(key);out.push({name,team,status:String(status?.name||status||'Status reported'),detail:String(detail||''),date:o.date||o.updated||o.lastUpdated||''})}
   }
  });
  return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 }
 function newsFrom(data){return (data.articles||data.headlines||[]).map(x=>({title:x.headline||x.title||'NHL update',summary:x.description||x.summary||'',url:x.links?.web?.href||x.link?.href||x.links?.api?.self?.href||'https://www.espn.com/nhl/',date:x.published||x.lastModified||'',image:x.images?.find(i=>i.ratio==='16x9')?.url||x.images?.[0]?.url||''})).slice(0,18)}
 const badge=(s)=>{const v=String(s||'').toLowerCase();return v.includes('out')||v.includes('injur')||v.includes('ir')?'out':v.includes('question')||v.includes('day-to-day')||v.includes('doubt')?'question':'info'};
 async function renderUpdates(){
  if(updateBusy)return;updateBusy=true;
  const root=$('nhlupdates');if(!root)return;
  try{
   const d=today(),[score,inj,news]=await Promise.all([
    get(nhl+'score/'+d),
    get(espn+'injuries').catch(()=>null),
    get(espn+'news?limit=18').catch(()=>null)
   ]);
   const games=score.games||[],reports=inj?injuriesFrom(inj):[],articles=news?newsFrom(news):[];
   const teams=[...new Set(games.flatMap(g=>[g.awayTeam?.abbrev,g.homeTeam?.abbrev]).filter(Boolean))];
   const relevant=reports.filter(x=>!x.team||teams.some(t=>t===x.team||String(x.team).toUpperCase().includes(t)||[games.find(g=>g.homeTeam?.abbrev===t)?.homeTeam?.name?.default,games.find(g=>g.awayTeam?.abbrev===t)?.awayTeam?.name?.default].some(n=>n&&String(x.team).toLowerCase().includes(n.toLowerCase()))));
   let scratch=[];
   const boxes=await Promise.all(games.map(g=>g.id?get(nhl+'gamecenter/'+g.id+'/boxscore').catch(()=>null):null));
   boxes.forEach((b,i)=>{
    if(!b)return;
    ['awayTeam','homeTeam'].forEach(side=>{
     const t=b[side],abbr=t?.abbrev||games[i][side]?.abbrev||'';
     (t?.scratches||b?.scratches?.[side]||[]).forEach(p=>scratch.push({name:p.name?.default||p.name||p.firstName?.default+' '+p.lastName?.default||'Player',team:abbr,reason:'Official game-centre scratch'}));
    });
   });
   const gameCards=games.map(g=>{const a=g.awayTeam||{},h=g.homeTeam||{},s=gameStatus(g),time=g.startTimeUTC?fmtTime(g.startTimeUTC):'Time TBA';return '<div class="nhl-game"><div class="nhl-game-teams"><span><img src="'+esc(a.logo||teamLogo(a.abbrev))+'" alt="">'+esc(a.abbrev||'—')+'</span><b>'+(s==='UPCOMING'?'vs':esc(a.score??0)+' – '+esc(h.score??0))+'</b><span><img src="'+esc(h.logo||teamLogo(h.abbrev))+'" alt="">'+esc(h.abbrev||'—')+'</span></div><div class="nhl-game-meta"><span class="nhl-state '+s.toLowerCase()+'">'+s+'</span><span>'+esc(time)+'</span></div></div>'}).join('');
   const injuryCards=relevant.map(x=>'<article class="injury-row"><div class="injury-dot '+badge(x.status)+'"></div><div class="injury-copy"><b>'+esc(x.name)+'</b><span>'+esc(x.team||'NHL')+' · '+esc(x.status)+'</span>'+(x.detail?'<p>'+esc(x.detail)+'</p>':'')+'</div><small>'+esc(fmtTime(x.date)||'ESPN report')+'</small></article>').join('');
   const scratchCards=scratch.map(x=>'<article class="injury-row"><div class="injury-dot out"></div><div class="injury-copy"><b>'+esc(x.name)+'</b><span>'+esc(x.team)+' · Confirmed scratch</span><p>'+esc(x.reason)+'</p></div></article>').join('');
   const newsCards=articles.map(x=>'<a class="news-row" href="'+esc(x.url)+'" target="_blank" rel="noopener">'+(x.image?'<img src="'+esc(x.image)+'" alt="" loading="lazy">':'')+'<span><b>'+esc(x.title)+'</b><small>'+esc(fmtTime(x.date)||'NHL news')+'</small>'+(x.summary?'<p>'+esc(x.summary)+'</p>':'')+'</span><i>↗</i></a>').join('');
   root.innerHTML='<div class="nhl-page-head"><div><span class="nhl-eyebrow">THE LEAGUE DESK</span><h2>NHL Central</h2><p class="sub">Who is available, who is out, and what is happening around the league.</p></div><button class="btn secondary" id="refreshNhl">↻ Refresh</button></div><div class="nhl-livebar"><span><i></i> LIVE DATA CHECK</span><b>Last checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})+'</b><span>Auto-refresh every 90 sec while open</span></div><h3 class="nhl-section-title">Tonight on the ice <small>'+games.length+' games · '+esc(d)+'</small></h3><div class="nhl-games">'+(gameCards||'<div class="empty">No NHL games scheduled today.</div>')+'</div><div class="nhl-two-col"><section class="card"><h3>Availability & injuries <small>ESPN injury report</small></h3><p class="small">Injury reports are not the same as confirmed scratches. A player can be ruled out before the official lineup is posted.</p>'+(injuryCards||'<div class="empty">'+(inj?'No matching injury reports for teams playing today.':'Injury feed unavailable right now.')+'</div>')+'</section><section class="card"><h3>Confirmed scratches <small>Official NHL game centre</small></h3>'+(scratchCards||'<div class="empty">No official scratch list posted yet. Healthy scratches may only appear closer to puck drop.</div>')+'</section></div><section class="card nhl-news-panel"><div class="nhl-panel-head"><h3>Latest NHL news</h3><a href="https://www.espn.com/nhl/" target="_blank" rel="noopener">More NHL news ↗</a></div>'+(newsCards||'<div class="empty">News feed unavailable right now.</div>')+'</section><p class="nhl-footnote">Sources: NHL game centre and ESPN. Injury news and lineup confirmations can be delayed by the teams or source providers.</p>';
   $('refreshNhl')?.addEventListener('click',renderUpdates);
   lastUpdate=Date.now();
  }catch(e){root.innerHTML='<h2>NHL Central</h2><div class="callout">Could not load the NHL update feeds. Check your connection and tap Refresh to try again.<br><small>'+esc(e.message)+'</small></div><button class="btn" id="refreshNhl">Try again</button>';$('refreshNhl')?.addEventListener('click',renderUpdates)}
  finally{updateBusy=false}
 }
 function playerMap(box,g){
  const map={};['awayTeam','homeTeam'].forEach(side=>{const t=box?.playerByGameStats?.[side]||box?.[side]||{};['forwards','defense','goalies','scratches'].forEach(group=>(t[group]||[]).forEach(p=>{const id=p.playerId||p.id;if(!id)return;map[id]={id,name:p.name?.default||p.name||[p.firstName?.default,p.lastName?.default].filter(Boolean).join(' ')||'NHL player',headshot:p.headshot,team:p.teamAbbrev||g[side]?.abbrev||''}}))});return map
 }
 async function renderGoals(){
  if(goalBusy)return;goalBusy=true;const root=$('livefeed');if(!root){goalBusy=false;return}
  try{
   const date=today(),score=await get(nhl+'score/'+date),games=score.games||[];
   const summaries=await Promise.all(games.map(async g=>{
    if(!g.id)return {g,pbp:null,box:null};
    const [pbp,box]=await Promise.all([
     get(nhl+'gamecenter/'+g.id+'/play-by-play').catch(()=>null),
     get(nhl+'gamecenter/'+g.id+'/boxscore').catch(()=>null)
    ]);
    return {g,pbp,box};
   }));
   const events=[];
   summaries.forEach(({g,pbp,box})=>{
    if(!pbp)return;
    const away=g.awayTeam||{},home=g.homeTeam||{};
    const playerNames={};
    const sides=box?.playerByGameStats||{};
    ['awayTeam','homeTeam'].forEach(side=>{
     const groups=sides[side]||box?.[side]||{};
     ['forwards','defense','goalies','scratches'].forEach(group=>(groups[group]||[]).forEach(p=>{
      const id=Number(p.playerId||p.id);if(!id)return;
      const first=p.firstName?.default||p.firstName||'',last=p.lastName?.default||p.lastName||'';
      playerNames[id]={id,name:p.name?.default||p.name||[first,last].filter(Boolean).join(' ')||'NHL player',headshot:p.headshot||'',team:p.teamAbbrev||g[side]?.abbrev||''};
     }));
    });
    const plays=Array.isArray(pbp.plays)?pbp.plays:Array.isArray(pbp.gameEvents)?pbp.gameEvents:[];
    plays.forEach((play,index)=>{
     const kind=String(play.typeDescKey||play.type||play.eventType||'').toLowerCase();
     if(kind!=='goal'&&!kind.endsWith(':goal')&&!/\\bgoal\\b/i.test(String(play.details?.eventDescription||play.description||'')))return;
     const d=play.details||play;
     const scorerId=Number(d.scoringPlayerId||d.scorerPlayerId||d.playerId||0);
     const a1=Number(d.assist1PlayerId||d.assistPlayerId||0),a2=Number(d.assist2PlayerId||0);
     const owner=Number(d.eventOwnerTeamId||0);
     const scoringTeam=(owner&&String(owner)===String(g.homeTeam?.id))?home:(owner&&String(owner)===String(g.awayTeam?.id))?away:null;
     const teamAbbr=scoringTeam?.abbrev||d.eventOwnerTeamAbbrev||'';
     const scorer=playerNames[scorerId]||{id:scorerId,name:d.scoringPlayerName||d.playerName||'Goal scorer',team:teamAbbr};
     const pd=play.periodDescriptor||{};
     const period=pd.number||play.period||'';
     const when=play.timeInPeriod||play.time||'';
     const scoreText=(d.awayScore!==undefined&&d.homeScore!==undefined)?d.awayScore+' – '+d.homeScore:(away.score??0)+' – '+(home.score??0);
     const stamp=Date.parse(play.timeRemaining||play.date||g.startTimeUTC||'')||index;
     const base={order:stamp,key:String(g.id)+'-'+String(play.eventId||play.eventId||index),when,period,team:teamAbbr,game:(away.abbrev||'AWY')+' @ '+(home.abbrev||'HOM'),scoreText,state:gameStatus(g)==='LIVE'?'LIVE':'FINAL'};
     const make=(p)=>({id:p.id,name:p.name,headshot:p.headshot,team:p.team||teamAbbr});
     events.push({...base,kind:'GOAL',player:make(scorer)});
     [a1,a2].filter((id,i,arr)=>id&&id!==scorerId&&arr.indexOf(id)===i).forEach(id=>{
      const assister=playerNames[id]||{id,name:'Assist credited',team:teamAbbr};
      events.push({...base,key:base.key+'-assist-'+id,kind:'ASSIST',player:make(assister)});
     });
    });
   });
   events.sort((a,b)=>b.order-a.order);
   const cards=events.map(e=>{
    const photo=e.player.headshot||(e.player.id?'https://assets.nhle.com/mugs/nhl/'+(new Date().getMonth()>=8?new Date().getFullYear():new Date().getFullYear()-1)+(new Date().getMonth()>=8?new Date().getFullYear()+1:new Date().getFullYear())+'/'+(e.player.team||e.team)+'/'+e.player.id+'.png':'');
    return '<article class="achievement-card '+(e.kind==='GOAL'?'goal-card':'assist-card')+'"><div class="achievement-top"><span class="achievement-stamp">'+(e.kind==='GOAL'?'🏆 GOAL':'⚡ ASSIST')+'</span><span class="achievement-time">'+(e.period?'P'+esc(e.period):'')+(e.when?' · '+esc(e.when):'')+'</span></div><div class="achievement-main">'+(photo?'<img class="achievement-photo" src="'+esc(photo)+'" alt="'+esc(e.player.name)+'" loading="lazy" onerror="this.style.display=\\'none\\'">':'<div class="achievement-photo placeholder">🏒</div>')+'<div class="achievement-player"><b>'+esc(e.player.name)+'</b><span>'+esc(e.player.team||e.team)+' · '+e.kind+'</span><small>'+esc(e.game)+'</small></div><div class="achievement-score">'+esc(e.scoreText)+'</div></div><div class="achievement-bottom"><span>'+esc(e.state==='LIVE'?'LIVE GAME':'GAME UPDATE')+'</span><span>'+esc(e.key.slice(-8))+'</span></div></article>';
   }).join('');
   const failed=summaries.filter(x=>!x.pbp).length;
   root.innerHTML='<div class="nhl-page-head"><div><span class="nhl-eyebrow">AROUND THE RINK</span><h2>Live Moments</h2><p class="sub">Every NHL goal and credited assist appears as its own card.</p></div><button class="btn secondary" id="refreshGoals">↻ Refresh</button></div><div class="nhl-livebar"><span><i></i> OFFICIAL NHL PLAY-BY-PLAY</span><b>'+events.length+' scoring moments today</b><span>Checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' · Refreshes every 30 sec</span></div><div class="achievement-feed">'+(cards||'<div class="empty">'+(games.length?'No goals or assists are posted yet.'+(failed?' '+failed+' game play-by-play feed(s) are temporarily unavailable.':''):'No NHL games scheduled today.')+'</div>')+'</div><p class="nhl-footnote">Source: NHL game-centre play-by-play and boxscores. Goal and assist credits follow the official NHL event feed.</p>';
   $('refreshGoals')?.addEventListener('click',renderGoals);lastGoals=Date.now();
  }catch(e){
   root.innerHTML='<h2>Live Moments</h2><div class="callout">Could not load the official NHL scoring feed.<br><small>'+esc(e.message)+'</small></div><button class="btn" id="refreshGoals">Try again</button>';
   $('refreshGoals')?.addEventListener('click',renderGoals);
  }finally{goalBusy=false}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('nav button[data-tab]');if(!b)return;if(b.dataset.tab==='nhlupdates')renderUpdates();if(b.dataset.tab==='livefeed')renderGoals()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){const p=document.querySelector('.page:not(.hidden)');if(p?.id==='nhlupdates')renderUpdates();if(p?.id==='livefeed')renderGoals()}});
 setInterval(()=>{const p=document.querySelector('.page:not(.hidden)');if(document.hidden)return;if(p?.id==='nhlupdates'&&Date.now()-lastUpdate>85000)renderUpdates();if(p?.id==='livefeed'&&Date.now()-lastGoals>25000)renderGoals()},15000);
})();