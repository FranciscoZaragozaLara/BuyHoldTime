import { useMemo } from 'react';
import type { RegimeLive } from './RegimesDocsTable';
import { getClosestPrice, getCpiYoY, getRecentPrice, marginGdpRatio } from '@/lib/seriesLookup';

// Motor de los 3 regímenes (R1 estructural CAPE+Core CPI, R2 Z(Margin/GDP) con memoria 6M, R3 complacencia HY)
// y snapshot vivo para la documentación. Antes dentro de RegimesPanel; la ventana de R3 depende de la vista.
export function useRegimeEngine(cape: any[], marketHistory: Record<string, Map<string, number>>, capeView: 'daily' | 'monthly' | 'yearly') {
  const getMarginGdpRatio = (d: string) => marginGdpRatio(marketHistory['FINRA_DEBIT'], marketHistory['GDP'], d);
  // Régimen simple: Bull/Bear/Stress basado en umbrales (legacy, para columna Régimen)
  function getRegime(d:string, capeVal:number|null, ratio:number|null): string {
    const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'],d);
    const mg=getMarginGdpRatio(d);
    if(capeVal!=null && capeVal>30) return 'Stress';
    if(hy!=null && hy>5) return 'Stress';
    if(mg!=null && mg>5) return 'Stress';
    if(capeVal!=null && capeVal<20 && (hy==null||hy<3)) return 'Bull';
    if(ratio!=null && ratio<0.9) return 'Bull';
    return 'Neutral';
  }

  // Nuevos 3 regímenes Bosque Seco — medición sin disparar trades
  function getSMA(values:number[]): number | null { if(!values.length) return null; return values.reduce((a,b)=>a+b,0)/values.length; }
  function getStd(values:number[], mean:number): number | null { if(values.length<2) return null; const v=values.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(values.length-1); return Math.sqrt(v); }
  function getPercentile(values:number[], p:number): number | null { if(!values.length) return null; const s=[...values].sort((a,b)=>a-b); const idx=Math.floor(p*s.length); return s[Math.min(idx, s.length-1)]; }

  // Cache para series históricas — memoizado (evita reconstruir 9k entradas por cada fila)
  const allCapeDates = useMemo(()=> cape.map((r:any)=> String(r.date).slice(0,10)).sort(), [cape]);
  const { marginGdpCache, hyCache } = useMemo(()=>{
    const mgMap = new Map<string, number>();
    const hMap = new Map<string, number>();
    if(!cape.length || !marketHistory['FINRA_DEBIT'] || !marketHistory['GDP']) return { marginGdpCache: mgMap, hyCache: hMap };
    for(const r of cape){
      const d=String(r.date).slice(0,10);
      const finra=getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45);
      const gdp=getRecentPrice(marketHistory['GDP'], d, 120);
      const mg = (finra!=null && gdp!=null && gdp!==0) ? (finra/1000)/gdp*100 : null;
      if(mg!=null) mgMap.set(d, mg);
      const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
      if(hy!=null) hMap.set(d, hy);
    }
    return { marginGdpCache: mgMap, hyCache: hMap };
  }, [cape, marketHistory]);
  // Memoizar serie mensual unificada (usada por Z 36M)
  const { monthlyMgMap, monthlyKeys } = useMemo(()=>{
    const mMap = new Map<string, number>();
    for(const dd of allCapeDates){
      const mKey = dd.slice(0,7);
      const v = marginGdpCache.get(dd);
      if(v!=null) mMap.set(mKey, v);
    }
    return { monthlyMgMap: mMap, monthlyKeys: Array.from(mMap.keys()).sort() };
  }, [allCapeDates, marginGdpCache]);
  // Core CPI mensual memoizado — YoY % por FECHA (no por índice) — Agosto sin dato mantiene Julio hasta publicar
  const { cpiMonthlyMap, cpiKeys, cpiSma12Map, cpiYoYMap, cpiYoYSma12Map, monthLastDate } = useMemo(()=>{
    const cmap = new Map<string, number>();
    const lastMap = new Map<string, string>();
    // Solo meses con dato real FRED (sin ffill): August sin publicar no crea entrada, su YoY queda en Julio
    const src = marketHistory['CPILFESL'];
    if(src){
      for(const [dateStr, val] of src.entries()){
        const mk = dateStr.slice(0,7);
        // FRED mensual viene el día 01 — agrupamos por mes, último valor del mes
        if(val!=null && isFinite(val)){
          cmap.set(mk, val as number);
          lastMap.set(mk, dateStr);
        }
      }
    }
    const keys = Array.from(cmap.keys()).sort();
    const smaMap = new Map<string, number>();
    for(let i=0;i<keys.length;i++){
      const sKeys=keys.slice(Math.max(0,i-11),i+1);
      const vals=sKeys.map(k=> cmap.get(k)).filter((v):v is number=>v!=null) as number[];
      if(vals.length>=6) smaMap.set(keys[i], vals.reduce((a,b)=>a+b,0)/vals.length);
    }
    // YoY % por FECHA exacta mismo mes hace 12m (no shift índice) — evita Oct faltante
    const yoYMap = new Map<string, number>();
    for(const mk of keys){
      const d=new Date(mk+'-15'); d.setFullYear(d.getFullYear()-1); const prevMk = d.toISOString().slice(0,7);
      const cur = cmap.get(mk); const prev = cmap.get(prevMk);
      if(cur!=null && prev!=null && prev!==0) yoYMap.set(mk, (cur/prev-1)*100);
    }
    const yoYSmaMap = new Map<string, number>();
    for(let i=0;i<keys.length;i++){
      const mk=keys[i];
      if(!yoYMap.has(mk)) continue;
      const sKeys=keys.slice(Math.max(0,i-11),i+1).filter(k=> yoYMap.has(k));
      const vals=sKeys.map(k=> yoYMap.get(k)!).filter(v=> v!=null && isFinite(v));
      if(vals.length>=6) yoYSmaMap.set(mk, vals.reduce((a,b)=>a+b,0)/vals.length);
    }
    return { cpiMonthlyMap: cmap, cpiKeys: keys, cpiSma12Map: smaMap, cpiYoYMap: yoYMap, cpiYoYSma12Map: yoYSmaMap, monthLastDate: lastMap };
  }, [allCapeDates, marketHistory]);

  function getRegimeDetails(d:string, capeVal:number|null, mean3yVal:number|null){
    const windowSize = capeView==='daily' ? 756 : capeView==='monthly' ? 36 : 3;
    const idx = allCapeDates.indexOf(d);
    // R1 — Condición Estructural 4 fases: CAPE>1.18 AND Core CPI YoY≥4.0 & >SMA12×1.20 (SMA12M YoY %)
    let r1Active=false; let r1Thr:number|null=null; let r1Ratio:number|null=null; let r1Cpi:number|null=null; let r1CpiSma12:number|null=null; let r1Armed=false;
    // Core CPI YoY % — corrige puntos→% + ffill 90d para Aug
    let r1CoreCpiYoY:number|null=null;
    {
      const curMk = d.slice(0,7);
      let y = cpiYoYMap.get(curMk) ?? null;
      if(y==null){
        let b=-1; for(let i=0;i<cpiKeys.length;i++) if(cpiKeys[i]<=curMk) b=i;
        if(b>=0) y = cpiYoYMap.get(cpiKeys[b]) ?? null;
      }
      let sma = cpiYoYSma12Map.get(curMk) ?? null;
      if(sma==null){
        let b=-1; for(let i=0;i<cpiKeys.length;i++) if(cpiKeys[i]<=curMk) b=i;
        if(b>=0) sma = cpiYoYSma12Map.get(cpiKeys[b]) ?? null;
      }
      r1Cpi = y;
      r1CpiSma12 = sma;
      r1CoreCpiYoY = y;
    }
    // fallback: si aún null por gap >90d, usa getCpiYoY directo (forward-fill último)
    if(r1Cpi==null){
      const y2 = getCpiYoY(marketHistory['CPILFESL'], d);
      if(y2!=null) r1Cpi = y2;
    }
    if(capeVal!=null && mean3yVal!=null){ r1Thr=mean3yVal*1.18; r1Ratio=capeVal/mean3yVal; const capeOk=capeVal > r1Thr; const cpiOk = r1Cpi!=null && r1CpiSma12!=null ? r1Cpi >=4.0 && r1Cpi > r1CpiSma12*1.20 : false; r1Active=capeOk && cpiOk; r1Armed=r1Active; }
    // R2 — Z(Margin/GDP) 4 fases: Fase 1 armado con memoria 6M (Z>2.0 en ÚLTIMOS 6M persiste hasta Z<0)
    let r2Active=false; let r2Mg:number|null=getMarginGdpRatio(d); let r2Mean:number|null=null; let r2Std:number|null=null; let r2Z:number|null=null;
    let r2Armed=false; let r2ArmedMonth:string|null=null; let r2ArmedDate:string|null=null; let r2DisarmedDate:string|null=null;
    if(r2Mg!=null){
      // monthlyMgMap/monthlyKeys ya memoizados arriba — no reconstruir por fila
      const curMonth = d.slice(0,7);
      let mIdx = monthlyKeys.indexOf(curMonth);
      if(mIdx===-1){ let best=-1; for(let i=0;i<monthlyKeys.length;i++) if(monthlyKeys[i]<=curMonth) best=i; mIdx=best; }
      if(mIdx>=0){
        const sliceKeys = monthlyKeys.slice(Math.max(0, mIdx-35), mIdx+1);
        const vals = sliceKeys.map(k=> monthlyMgMap.get(k)).filter((v):v is number=>v!=null);
        if(vals.length>=12){ r2Mean=getSMA(vals); r2Std=r2Mean!=null?getStd(vals,r2Mean):null; if(r2Mean!=null && r2Std!=null && r2Std>0){ r2Z=(r2Mg-r2Mean)/r2Std; } }
        // Fase 1: armado si Z>2.0 en cualquier momento de últimos 6 meses (con memoria hasta Z<0)
        // Para icono y tabla, r2Active refleja estado ARMADO (no Z instantáneo)
        let found=false;
        for(let k=0;k<6;k++){
          const idx2 = mIdx - k;
          if(idx2<0) break;
          const mKey2 = monthlyKeys[idx2];
          const mg2 = monthlyMgMap.get(mKey2);
          if(mg2==null) continue;
          const sKeys2 = monthlyKeys.slice(Math.max(0, idx2-35), idx2+1);
          const v2 = sKeys2.map(x=> monthlyMgMap.get(x)).filter((v):v is number=>v!=null);
          if(v2.length<12) continue;
          const mean2=getSMA(v2); const std2= mean2!=null?getStd(v2,mean2):null;
          if(mean2!=null && std2!=null && std2>0){
            const z2=(mg2-mean2)/std2;
            if(z2>2.0){ found=true; r2ArmedMonth=mKey2; r2ArmedDate = monthLastDate.get(mKey2) ?? mKey2; break; }
          }
        }
        // Si estamos armados, mantenemos r2Active=true aunque Z ACTUAL baje, hasta desarme Z<0 (Fase 4) — para icono simple usamos armado
        // Desarme total: Z<0 desactiva
        if(r2Z!=null && r2Z<0){ r2Armed=false; r2ArmedMonth=null; r2ArmedDate=null; r2DisarmedDate=d; r2Active=false; }
        else if(found){ r2Armed=true; r2Active=true; r2DisarmedDate=null; }
        else { r2Armed=false; r2ArmedDate=null; r2DisarmedDate=null; r2Active=false; }
      }
    }
    // R3
    let r3Active=false; let r3Hy:number|null=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); let r3P20:number|null=null; let r3Complacencia=false; let r3LtP20=false; let r3Lt35=false;
    if(r3Hy!=null){
      r3Lt35=r3Hy<3.5;
      if(idx>=0){
        const slice=allCapeDates.slice(Math.max(0, idx-windowSize+1), idx+1);
        const vals=slice.map(x=> hyCache.get(x)).filter((v):v is number=>v!=null);
        if(vals.length>=12){ r3P20=getPercentile(vals,0.20); if(r3P20!=null){ r3LtP20=r3Hy<r3P20; r3Complacencia=r3LtP20||r3Lt35; } else r3Complacencia=r3Lt35; } else r3Complacencia=r3Lt35;
      } else r3Complacencia=r3Lt35;
      r3Active=r3Complacencia;
    }
    return {
      r1:{active:r1Active, cape:capeVal, sma:mean3yVal, thr:r1Thr, ratio:r1Ratio, cpi:r1Cpi, cpiSma12:r1CpiSma12, armed:r1Armed},
      r2:{active:r2Active, mg:r2Mg, mean:r2Mean, std:r2Std, z:r2Z, armed:r2Armed, armedMonth:r2ArmedMonth, armedDate:r2ArmedDate, disarmedDate:r2DisarmedDate},
      r3:{active:r3Active, hy:r3Hy, p20:r3P20, complacencia:r3Complacencia, ltP20:r3LtP20, lt35:r3Lt35, r1:r1Active, r2:r2Active},
    };
  }

  // Snapshot vivo para Documentación de Regímenes: estado del último día + diferenciales
  // por fase (F0/G1/G2… con valores y gaps). Lo consume <RegimesDocsTable live={...} />.
  const regimeLive: RegimeLive = useMemo(()=>{
    if(!allCapeDates.length) return null;
    const d = allCapeDates[allCapeDates.length-1];
    const capeRow: any = (cape as any[]).find((r:any)=> String(r.date).slice(0,10)===d);
    const det = getRegimeDetails(d, capeRow?.cape ?? null, capeRow?.mean3y ?? capeRow?.mean ?? null);
    const seriesOf = (k:string): Array<[string,number]> => {
      const m = marketHistory[k]; if(!m) return [];
      return Array.from(m.entries()).map(([dt,v]):[string,number]=>[String(dt).slice(0,10), Number(v)]).filter(([,v])=>isFinite(v)).sort((a,b)=>a[0].localeCompare(b[0]));
    };
    const atOrBefore = (s:Array<[string,number]>, iso:string): [string,number]|null => { let b:[string,number]|null=null; for(const e of s){ if(e[0]<=iso) b=e; else break; } return b; };
    const shiftDays = (iso:string, n:number) => { const t=new Date(iso); t.setDate(t.getDate()-n); return t.toISOString().slice(0,10); };
    const mean = (a:number[]): number|null => a.length? a.reduce((x,y)=>x+y,0)/a.length : null;
    const std = (a:number[], m:number): number|null => { if(a.length<2) return null; return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/(a.length-1)); };
    // FED (Δ) / DGS10 (SMA200) / SPX (SMA50/30/100)
    const fedS = seriesOf('DFEDTARU');
    const dFed = fedS.length>=2 ? fedS[fedS.length-1][1]-fedS[fedS.length-2][1] : null;
    const d10S = seriesOf('DGS10');
    const d10Last = d10S.length? d10S[d10S.length-1][1]:null;
    const sma200 = d10S.length>=200? mean(d10S.slice(-200).map(e=>e[1])) : null;
    const spxS = seriesOf('^GSPC');
    const spxLast = spxS.length? spxS[spxS.length-1][1]:null;
    const spxSma = (n:number) => spxS.length>=n? mean(spxS.slice(-n).map(e=>e[1])):null;
    // Margin/GDP mensual: ROC3M + σ24M del ROC
    let roc3m:number|null=null, sigma24:number|null=null;
    if(monthlyKeys.length>=4){
      const mgv = (i:number)=> monthlyMgMap.get(monthlyKeys[i]) ?? null;
      const last = mgv(monthlyKeys.length-1), prev = mgv(monthlyKeys.length-4);
      if(last!=null && prev!=null) roc3m = last-prev;
      const rocs:number[]=[];
      for(let i=Math.max(3,monthlyKeys.length-27); i<monthlyKeys.length; i++){ const a=mgv(i), b=mgv(i-3); if(a!=null&&b!=null) rocs.push(a-b); }
      if(rocs.length>=2){ const m=mean(rocs)!; sigma24=std(rocs,m); }
    }
    // HY OAS diario: Δ3M/Δ1M, σ24M, SMAs, P20_36M
    const hyS = seriesOf('BAMLH0A0HYM2');
    let hy:number|null=null,d3m:number|null=null,sig:number|null=null,d1m:number|null=null,sma36:number|null=null,sma12m:number|null=null,sma3m:number|null=null,p20_36:number|null=null;
    if(hyS.length){
      hy = hyS[hyS.length-1][1];
      const lastD = hyS[hyS.length-1][0];
      const v3 = atOrBefore(hyS, shiftDays(lastD,91)), v1 = atOrBefore(hyS, shiftDays(lastD,30));
      if(v3) d3m = hy-v3[1];
      if(v1) d1m = hy-v1[1];
      const closes = hyS.map(e=>e[1]);
      sma36 = mean(closes.slice(-1095)); sma12m = mean(closes.slice(-365)); sma3m = mean(closes.slice(-91));
      const srt=[...closes.slice(-1095)].sort((a,b)=>a-b);
      p20_36 = srt.length? srt[Math.min(srt.length-1, Math.floor(0.20*srt.length))] : null;
      const d3s:number[]=[];
      for(const [dd] of hyS.slice(-730)){ const b=atOrBefore(hyS, shiftDays(dd,91)); const c=atOrBefore(hyS, dd); if(b&&c) d3s.push(c[1]-b[1]); }
      if(d3s.length>=2){ const m=mean(d3s)!; sig=std(d3s,m); }
    }
    return { date: d,
      r1: { active: !!det.r1.active, cape: det.r1.cape, thr: det.r1.thr, ratio: det.r1.ratio, cpi: det.r1.cpi, cpiSma: det.r1.cpiSma12, dFed, dgs10: d10Last, sma200x110: sma200!=null? sma200*1.10:null, spy: spxLast, sma50: spxSma(50) },
      r2: { active: !!det.r2.active, armed: !!det.r2.armed, z: det.r2.z, mg: det.r2.mg, mean: det.r2.mean, std: det.r2.std, roc3m, sigma24, spy: spxLast, sma50: spxSma(50) },
      r3: { active: !!det.r3.active, armed: !!det.r3.active, hy, p20: p20_36, d3m, sig, d1m, sma36, sma3m, sma12m, spy: spxLast, sma50: spxSma(50), sma30: spxSma(30), sma100: spxSma(100) } };
  }, [allCapeDates, cape, capeView, marketHistory, monthlyMgMap, monthlyKeys]);

  return { getRegime, getRegimeDetails, regimeLive };
}
