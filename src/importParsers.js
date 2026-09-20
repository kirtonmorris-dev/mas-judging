export function detectHeaderRowIndex(aoa){
  for(let i=0;i<Math.min(aoa.length,20);i++){
    const row = aoa[i] || [];
    const nonBlank = row.filter(c=>String(c||'').trim()!=='').length;
    const hasBand = row.some(c=>/band/i.test(String(c||'')));
    if(hasBand && nonBlank>=4) return i;
  }
  return 0;
}

export function parseCriterionHeader(text){
  const raw = String(text||'').trim().replace(/\s+/g,' ');
  const m = /^(.*?)(\d+)\s*$/.exec(raw);
  if(m){
    const label = m[1].trim().replace(/[\s,:\-\/]+$/,'');
    const max = parseInt(m[2],10);
    return { label: label || raw, max: isNaN(max)?0:max };
  }
  return { label: raw, max: 0 };
}

export function mapHeaderColumns(headerRow){
  const bandSyn = ['band','mas band','band name','name of the band'];
  const masqSyn = ['masquerader','masquerader name','name of the masquerader','name of masquerader'];
  const portSyn = ['portrayal','title','portrayal title','name of the portrayal'];
  let bandIdx=-1, masqIdx=-1, portIdx=-1;
  const criteriaCols = [];
  (headerRow||[]).forEach((cellRaw, idx)=>{
    const cell = String(cellRaw||'').trim();
    if(!cell) return;
    const key = cell.toLowerCase().replace(/\s+/g,' ').trim();
    if(bandSyn.includes(key)){ bandIdx = idx; return; }
    if(masqSyn.includes(key)){ masqIdx = idx; return; }
    if(portSyn.includes(key)){ portIdx = idx; return; }
    if(/total/i.test(cell)) return;
    const parsed = parseCriterionHeader(cell);
    if(parsed.label) criteriaCols.push({ idx, label: parsed.label, max: parsed.max });
  });
  return { bandIdx, masqIdx, portIdx, criteriaCols };
}
