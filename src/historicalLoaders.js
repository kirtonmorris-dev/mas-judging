import { saveConfig, saveScoresMerge } from './api.js';
import { cloneTemplate } from './constants.js';
import { render } from './main.js';
import { state } from './state.js';
import { showToast } from './ui.js';
import { currentEvent, scoreKey, uid } from './utils.js';

export async function loadBaltimoreHistorical(){
  const HIST_NAME = 'Baltimore One Carnival 2026 (Historical)';
  if(state.config.events.find(e=>e.name===HIST_NAME)){
    showToast('Historical Baltimore data already loaded');
    return;
  }
  const allJudgeNames = ['Judge 1','Judge 2','Judge 3'];
  const judges = allJudgeNames.map(name=>({name, pin:null}));

  function mkContestant(band, masquerader, portrayal){
    return {id:uid(), band, masquerader, portrayal, assignedJudges:[...allJudgeNames]};
  }
  function mkGroupEntry(band, portrayal){
    return {id:uid(), band, masquerader:'', portrayal, assignedJudges:[...allJudgeNames]};
  }

  const categories = [];

  const afiCat = {id:uid(), name:'Adult Female Individual', entryType:'individual', criteria: cloneTemplate(), contestants: [
    mkContestant('East Coast Limers','Alana Dopson','Pink - The Love Illusion'),
    mkContestant('East Coast Limers','Selah Thom','The Sand Dancer'),
    mkContestant('Jackie and Associates','Pearl Wallace','The Song of Rapso'),
    mkContestant('Dreamerz Carnival','Kierra Charles','Portrayal of Fer-de-lance'),
    mkContestant('Dreamerz Carnival','Maryze Williams','Portrayal of Scarlet Macaw'),
  ]};
  categories.push(afiCat);

  const queenCat = {id:uid(), name:'Adult Queen', entryType:'individual', criteria: cloneTemplate(), contestants: [
    mkContestant('East Coast Limers','Joanne Meighoo','The Color Pink - Love at First Sight'),
    mkContestant('Island Oasis','Lydia Allyene','Goddess of the Glaciers'),
    mkContestant('Coastal Breeze','Chyna Allen','The Different Cultures of Music'),
    mkContestant('Dreamerz Carnival','Anisha Gomez','Portrayal of Kaieteur Falls'),
    mkContestant('DC Jab Jab','','Princess of the Seas & Queen of Bacchanal'),
  ]};
  categories.push(queenCat);

  const kingCat = {id:uid(), name:'Adult King', entryType:'individual', criteria: cloneTemplate(), contestants: [
    mkContestant('East Coast Limers','Sidique Rivers','D Visitor - Illusion or Reality'),
    mkContestant('East Coast Limers','Antonio "AJ" Meighoo','Desert Mirage'),
    mkContestant('DC Jab Jab Posse','Tamara Dumas','Captain Bachannal'),
  ]};
  categories.push(kingCat);

  categories.push({id:uid(), name:'Junior Queen', entryType:'individual', criteria: cloneTemplate(), contestants: [
    mkContestant('East Coast Limers','Kylie Felix','Imagine Me')
  ]});

  categories.push({id:uid(), name:'Junior King', entryType:'individual', criteria: cloneTemplate(), contestants: [
    mkContestant('East Coast Limers','Kamil Reed','A Lamp in the Dark')
  ]});

  const smallBandCat = {id:uid(), name:'Adult Bands - Small (Costume)', entryType:'group', criteria: cloneTemplate(), contestants: [
    mkGroupEntry('We Lil Band','A Lamp in the Dark'),
    mkGroupEntry('Bmore Love Ting','Rep Yuh Flag Rep'),
    mkGroupEntry('Shakomba Mooko Jumbies','The Art of Balance and Skills'),
    mkGroupEntry('Roots and Culture','Amazing Oceanic Creatures'),
    mkGroupEntry('Dreamerz','Portrayal of Scarlet Macaw'),
  ]};
  categories.push(smallBandCat);

  const largeBandCat = {id:uid(), name:'Adult (Large) Band (Costume)', entryType:'group', criteria: cloneTemplate(), contestants: [
    mkGroupEntry('Costal Breeze','Our Song'),
    mkGroupEntry('USA Paddle DMV','Grand Masqurade Culture'),
    mkGroupEntry('East End Paddle Society USA','Mascara Parade'),
    mkGroupEntry('Island Oasis','Alkebulan'),
    mkGroupEntry('Richard Carnival','Flow'),
    mkGroupEntry('East Coast Limers','Illusion of Colors'),
    mkGroupEntry('Candice Carnival Creations','Battle of the Islands - Trinidad Versus Jamaica'),
  ]};
  categories.push(largeBandCat);

  const ncLargeCriteria = [
    {key:'colorImpact', label:'Color/Impact', max:30},
    {key:'creativityAuth', label:'Creativity/Authenticity', max:30},
    {key:'craftsmanship2', label:'Craftsmanship', max:30},
    {key:'presentation2', label:'Presentation', max:40},
  ];
  const ncLargeCat = {id:uid(), name:'Non-Costume Band Large', entryType:'group', criteria: ncLargeCriteria, contestants: [
    mkGroupEntry('DC Jab Jab Posse','All Aboard'),
    mkGroupEntry('Zanoble Paint and Powder Band','Dirty Mas'),
    mkGroupEntry('Color Me Krazy Mas','Carnival is Love: I Cyah Behave Mi Self'),
    mkGroupEntry('Blue Tantrum Mas','Road Reunion'),
  ]};
  categories.push(ncLargeCat);

  const ncSmallCriteria = [
    {key:'colorImpact', label:'Color/Impact', max:30},
    {key:'creativity2', label:'Creativity', max:30},
    {key:'presentation3', label:'Presentation', max:40},
  ];
  const ncSmallCat = {id:uid(), name:'Non-Costume Band Small', entryType:'group', criteria: ncSmallCriteria, contestants: [
    mkGroupEntry('We Lil Band','The Thundercats'),
    mkGroupEntry('Dreamerz Carnival','Colors of the Caribbean'),
  ]};
  categories.push(ncSmallCat);

  const histEvent = {id: uid(), name: HIST_NAME, judges, categories};
  state.config.events.push(histEvent);

  function findContestant(cat, band, port){
    return cat.contestants.find(c=>c.band===band && c.portrayal===port);
  }
  const newScores = {};
  function setScore(cat, ct, judgeName, values){
    const key = scoreKey(histEvent.id, cat.id, ct.id, judgeName);
    newScores[key] = {...values, judge: judgeName, event: histEvent.id, category: cat.id, contestant: ct.id, submittedAt: Date.now()};
  }

  setScore(afiCat, findContestant(afiCat,'East Coast Limers','Pink - The Love Illusion'), 'Judge 1', {presentation:14, craftsmanship:16, creativity:15, impact:12});
  setScore(afiCat, findContestant(afiCat,'East Coast Limers','The Sand Dancer'), 'Judge 1', {presentation:15, craftsmanship:15, creativity:16, impact:15});

  const sbScores = [
    ['We Lil Band','A Lamp in the Dark', [[15,15,10,10],[22,15,20,14],[25,14,25,14]]],
    ['Bmore Love Ting','Rep Yuh Flag Rep', [[10,10,10,12],[10,10,12,12],[10,10,10,10]]],
    ['Shakomba Mooko Jumbies','The Art of Balance and Skills', [[20,16,15,12],[10,16,15,12],[21,10,28,17]]],
    ['Roots and Culture','Amazing Oceanic Creatures', [[20,15,15,10],[26,15,21,14],[28,18,28,18]]],
    ['Dreamerz','Portrayal of Scarlet Macaw', [[10,10,10,10],[10,10,10,10],[10,10,10,10]]],
  ];
  sbScores.forEach(([band,port,judgeVals])=>{
    const ct = findContestant(smallBandCat, band, port);
    judgeVals.forEach((vals, i)=>{
      setScore(smallBandCat, ct, `Judge ${i+1}`, {presentation:vals[0], craftsmanship:vals[1], creativity:vals[2], impact:vals[3]});
    });
  });

  const lbScores = [
    ['Costal Breeze','Our Song', [[25,18,25,17],[28,16,28,18],[22,15,21,16]]],
    ['USA Paddle DMV','Grand Masqurade Culture', [[22,16,21,15],[13,15,20,16],[21,17,22,19]]],
    ['East End Paddle Society USA','Mascara Parade', [[21,15,22,15],[13,15,20,16],[20,18,20,18]]],
    ['Island Oasis','Alkebulan', [[26,18,27,18],[29,18,28,17],[25,18,26,18]]],
    ['Richard Carnival','Flow', [[25,17,25,17],[16,15,26,17],[25,19,25,16]]],
    ['East Coast Limers','Illusion of Colors', [[27,18,28,18],[16,15,26,17],[27,19,28,18]]],
    ['Candice Carnival Creations','Battle of the Islands - Trinidad Versus Jamaica', [[24,17,24,18],[23,17,24,16],[22,15,15,17]]],
  ];
  lbScores.forEach(([band,port,judgeVals])=>{
    const ct = findContestant(largeBandCat, band, port);
    judgeVals.forEach((vals, i)=>{
      setScore(largeBandCat, ct, `Judge ${i+1}`, {presentation:vals[0], craftsmanship:vals[1], creativity:vals[2], impact:vals[3]});
    });
  });

  const djjp = findContestant(ncLargeCat, 'DC Jab Jab Posse', 'All Aboard');
  setScore(ncLargeCat, djjp, 'Judge 1', {colorImpact:18, creativityAuth:14, craftsmanship2:20, presentation2:15});
  setScore(ncLargeCat, djjp, 'Judge 2', {colorImpact:23, creativityAuth:16, craftsmanship2:21, presentation2:17});

  const okC = await saveConfig();
  const okS = await saveScoresMerge(scores=>{
    Object.assign(scores, newScores);
    Object.keys(scores).forEach(k=>{
      if(k.startsWith('baltimore-one-carnival|')) delete scores[k];
    });
  });
  if(okC && okS){
    showToast('Baltimore 2026 historical data loaded');
    state.eventId = histEvent.id;
  } else {
    showToast('Historical load may be incomplete — check connection', true);
  }
  render();
}

export async function loadWIADCAJuniorData(){
  const ev = currentEvent();
  if(!ev){ showToast('Select an event first', true); return; }
  if(!ev.judges || ev.judges.length===0){ showToast('This event has no judges yet \u2014 add them in Setup first', true); return; }

  ev.name = `West Indian American Day Carnival Association \u2014 Junior Carnival`;

  const allJudgeNames = ev.judges.map(j=>j.name);

  function findOrCreateCat(name, entryType, criteriaDefs){
    let cat = ev.categories.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(!cat){
      cat = { id: uid(), name, entryType, criteria: criteriaDefs.map(c=>({key:uid(), label:c.label, max:c.max})), contestants: [] };
      ev.categories.push(cat);
    }
    return cat;
  }

  function addContestant(cat, band, masq, port){
    const isGroup = cat.entryType==='group';
    const dup = cat.contestants.find(ct=>
      ct.band.trim().toLowerCase()===band.trim().toLowerCase() &&
      ct.portrayal.trim().toLowerCase()===port.trim().toLowerCase() &&
      (isGroup || ct.masquerader.trim().toLowerCase()===masq.trim().toLowerCase())
    );
    if(dup){
      allJudgeNames.forEach(jn=>{ if(!dup.assignedJudges.includes(jn)) dup.assignedJudges.push(jn); });
      return dup;
    }
    const ct = {id:uid(), band, masquerader: isGroup?'':masq, portrayal:port, assignedJudges:[...allJudgeNames]};
    cat.contestants.push(ct);
    return ct;
  }

  const kingCat = findOrCreateCat('Junior King','individual',[
    {label:'Color & Impact', max:30},{label:'Creativity/ Authenticity', max:20},{label:'Presentation', max:20},{label:'Craftsmanship', max:30}
  ]);
  addContestant(kingCat, `D'Midas and Associate`, `Hunter Nanton`, `D'Watcher"`);

  const queenCat = findOrCreateCat('Junior Queen','individual',[
    {label:'Color & Impact', max:30},{label:'Creativity/ Authenticity', max:30},{label:'Presentation', max:20},{label:'Craftsmanship', max:20}
  ]);
  addContestant(queenCat, `D'Midas and Associate`, `Jeni Davidson`, `"D'Madam Botanica"`);

  const bandCriteria = [
    {label:'Color & Impact', max:30},{label:'Presentation', max:20},{label:'Spirit of Carnival', max:30},{label:'Mas on the Move', max:20}
  ];
  const largeCat = findOrCreateCat('Junior Band Large','group', bandCriteria);
  [
    [`Branches Mas`,`"Enchanted Tribal Colors"`],
    [`Sesame Carnival`,`"The Wait is Over"`],
    [`Rendezvous Mas`,``],
    [`D'Midas International NYC Inc.`,`"Oasis Garden"`],
    [`1199 SEIU Social Cultural Committee`,``],
    [`Seaside Mas`,``],
    [`Jump Up Production`,``],
    [`StronJeh International`,``],
    [`On Your Toes Junior Mas Band`,``],
    [`The Golden Danceretes`,``],
    [`Platinum Kids Mas Alongside Kaios Kids`,``],
    [`Spice Island Shortknee`,`"Shortknee"`],
    [`Soca Royals Mas`,``],
    [`Gems of Egypt`,``],
    [`NYPD-Youth Dancer`,``],
    [`INSPIRED BY ZOE`,``],
    [`Kaiso Kids/Platinum Kids Mas`,`"Kilulma-Majesty of the Savannah"/Mel'e" the Circle of Life"`],
    [`Kaiso Moko Jumbies`,`"The Battle"`],
    [`Kaiso Moko Jumbies USA`,`"The Battle"`],
    [`Sherzel Production`,`"Revolution The Rise of Energy"`],
    [`On Your Toes Junior Mas Band`,`"Out of this World"`],
    [`Branches Mas Band`,`"Enchanted Tribal Colors"`],
  ].forEach(([band,port])=> addContestant(largeCat, band, '', port));

  const mediumCriteria = [
    {label:'Color & Impact', max:30},{label:'Presentation', max:30},{label:'Spirit of Carnival', max:20},{label:'Mas on the Move', max:20}
  ];
  findOrCreateCat('Junior Band Medium','group', mediumCriteria);
  findOrCreateCat('Junior Band Small','group', mediumCriteria);

  const femaleCat = findOrCreateCat('Junior Female Individual','individual', mediumCriteria);
  [
    [`Sherzel Kids`,`Milan'Rose Hamilton`,`"Elipse"`],
    [`Sherzel Kids`,`Sariyah Phillips`,`"Electric"`],
    [`Sherzel Kids`,`Kelsey Lewis`,`"IGNITE - The Spark That Starts The Revolution"`],
    [`Sherzel Kids`,`Azariah Abdullah`,`"Majestic"`],
    [`Sherzel Kids`,`Python Samuel`,`"Chrome"`],
    [`D'Midas and Associate`,`Carmeila Martin`,`"D'Vision of the Oasis Garden"`],
    [`D'Midas and Associate`,`Smira Mohammed`,`"D Impress of D'Garden"`],
    [`D'Midas and Assoicate`,`Carmia Bridgeman`,`"D' Light of D' Oasis Garden"`],
    [`D'Midas and Associate`,`Tameika Johnson`,`"D' Empress of D'Oasis"`],
    [`D'Midas and Associate`,`Ayanna George`,`"D' Guardian of the Peacodk Kingdom"`],
    [`D'Midas and Associate`,`Sara Myton`,`"Princess Skura: Empress of the Chery"`],
  ].forEach(([band,masq,port])=> addContestant(femaleCat, band, masq, port));

  const maleCat = findOrCreateCat('Junior Male Individual','individual', mediumCriteria);
  addContestant(maleCat, `D'Midas and Associate`, `Christian`, `"D'Gaudian of the Oasis"`);

  const okC = await saveConfig();
  if(okC){
    showToast('WIADCA Junior Carnival data loaded');
  } else {
    showToast('Load may be incomplete \u2014 check connection', true);
  }
  render();
}

export async function fixBaltimoreCorrections(){
  const HIST_NAME = 'Baltimore One Carnival 2026 (Historical)';
  const ev = state.config.events.find(e=>e.name===HIST_NAME);
  if(!ev){
    showToast('Historical Baltimore event not found — load it first', true);
    return;
  }

  if(!ev.judges.find(j=>j.name==='Judge 4')){
    ev.judges.push({name:'Judge 4', pin:null});
  }

  const scoreSets = {};
  const scoreDeletes = [];

  const afiCat = ev.categories.find(c=>c.name==='Adult Female Individual');
  if(afiCat){
    const findCt = (band, port) => afiCat.contestants.find(c=>c.band===band && c.portrayal===port);
    const alana = findCt('East Coast Limers','Pink - The Love Illusion');
    const selah = findCt('East Coast Limers','The Sand Dancer');
    [alana, selah].forEach(ct=>{
      if(ct && !ct.assignedJudges.includes('Judge 4')) ct.assignedJudges.push('Judge 4');
    });
    const setSingle = (ct, judgeName, total) => {
      if(!ct) return;
      const key = scoreKey(ev.id, afiCat.id, ct.id, judgeName);
      scoreSets[key] = {presentation: total, craftsmanship:0, creativity:0, impact:0, totalOnly:true, judge:judgeName, event:ev.id, category:afiCat.id, contestant:ct.id, submittedAt:Date.now()};
    };
    setSingle(alana,'Judge 1',12); setSingle(alana,'Judge 2',16); setSingle(alana,'Judge 3',15); setSingle(alana,'Judge 4',14);
    setSingle(selah,'Judge 1',15); setSingle(selah,'Judge 2',15); setSingle(selah,'Judge 3',16); setSingle(selah,'Judge 4',15);
    const pearl = findCt('Jackie and Associates','The Song of Rapso');
    if(pearl){
      ['Judge 1','Judge 2','Judge 3','Judge 4'].forEach(j=>{
        scoreDeletes.push(scoreKey(ev.id, afiCat.id, pearl.id, j));
      });
    }
  }

  const nclCat = ev.categories.find(c=>c.name==='Non-Costume Band Large');
  if(nclCat){
    const findCt2 = (band, port) => nclCat.contestants.find(c=>c.band===band && c.portrayal===port);
    const djjp = findCt2('DC Jab Jab Posse','All Aboard');
    const zan = findCt2('Zanoble Paint and Powder Band','Dirty Mas');
    const cmk = findCt2('Color Me Krazy Mas','Carnival is Love: I Cyah Behave Mi Self');
    const btm = findCt2('Blue Tantrum Mas','Road Reunion');
    const setSingleNC = (ct, judgeName, total) => {
      if(!ct) return;
      const key = scoreKey(ev.id, nclCat.id, ct.id, judgeName);
      scoreSets[key] = {colorImpact: total, creativityAuth:0, craftsmanship2:0, presentation2:0, totalOnly:true, judge:judgeName, event:ev.id, category:nclCat.id, contestant:ct.id, submittedAt:Date.now()};
    };
    setSingleNC(djjp,'Judge 1',63); setSingleNC(djjp,'Judge 2',67); setSingleNC(djjp,'Judge 3',77);
    setSingleNC(zan,'Judge 1',54); setSingleNC(zan,'Judge 2',73); setSingleNC(zan,'Judge 3',71);
    setSingleNC(cmk,'Judge 1',52); setSingleNC(cmk,'Judge 2',69); setSingleNC(cmk,'Judge 3',76);
    setSingleNC(btm,'Judge 1',64); setSingleNC(btm,'Judge 2',68); setSingleNC(btm,'Judge 3',81);
  }

  const okC = await saveConfig();
  const okS = await saveScoresMerge(scores=>{
    Object.assign(scores, scoreSets);
    scoreDeletes.forEach(k=>delete scores[k]);
  });
  if(okC && okS) showToast('Baltimore corrections applied');
  else showToast('Corrections may be incomplete — check connection', true);
  render();
}
