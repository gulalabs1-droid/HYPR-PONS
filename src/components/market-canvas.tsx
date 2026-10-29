"use client";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {createChart,AreaSeries,CandlestickSeries,HistogramSeries,createSeriesMarkers,ColorType,CrosshairMode,LineStyle,type IChartApi,type ISeriesApi,type IPriceLine,type UTCTimestamp,type SeriesMarker,type Time,type AutoscaleInfo} from "lightweight-charts";
import {marketCandles,marketPrice,marketAxisPrice,sparseMarketRange,includeFillPrices,type MarketTrade} from "@/lib/market";

export default function MarketCanvas({trades,markers,interval,style,selected,onSelect}:{trades:MarketTrade[];markers:MarketTrade[];interval:number;style:"line"|"candles";selected:string|null;onSelect:(id:string)=>void}) {
  const root=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),series=useRef<ISeriesApi<"Area"|"Candlestick">|null>(null),priceLine=useRef<IPriceLine|null>(null);
  const [hover,setHover]=useState(""),[expanded,setExpanded]=useState(false);
  const bars=useMemo(()=>marketCandles(trades,interval),[trades,interval]);
  const dataRef=useRef({trades,markers,bars,onSelect,selected});dataRef.current={trades,markers,bars,onSelect,selected};
  useEffect(()=>{
    if(!root.current)return;
    setHover("");
    const api=createChart(root.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:"#0c1118"},textColor:"#99a8bb",fontSize:11,fontFamily:"system-ui, sans-serif",attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:"#ffffff09"}},crosshair:{mode:CrosshairMode.Normal},rightPriceScale:{borderColor:"#ffffff0c",minimumWidth:80,scaleMargins:{top:.18,bottom:.24}},timeScale:{borderColor:"#ffffff0c",timeVisible:true,secondsVisible:interval===1,rightOffset:2},handleScroll:{vertTouchDrag:false},localization:{priceFormatter:marketAxisPrice}});
    const main=style==="candles"?api.addSeries(CandlestickSeries,{upColor:"#c7f36b",downColor:"#ff8496",wickUpColor:"#c7f36b",wickDownColor:"#ff8496",borderVisible:false}):api.addSeries(AreaSeries,{lineColor:"#c7f36b",topColor:"#c7f36b1c",bottomColor:"#c7f36b00",lineWidth:2,pointMarkersVisible:true,pointMarkersRadius:3});
    main.applyOptions({priceFormat:{type:"custom",formatter:marketAxisPrice,minMove:1e-12},autoscaleInfoProvider:(base:()=>AutoscaleInfo|null)=>{
      const range=base();if(!range?.priceRange)return range;
      // Fees put actual fills above/below the fee-exclusive market line. Price
      // lines/marker icon padding alone do not include those prices in scaling.
      range.priceRange=includeFillPrices(range.priceRange,dataRef.current.markers);
      return range;
    }});
    const volume=api.addSeries(HistogramSeries,{priceScaleId:"volume",priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false});
    volume.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0},visible:false});
    chart.current=api;series.current=main;
    const plugin=createSeriesMarkers(main,[],{autoScale:true});
    let fitted=false,fitFrame=0;
    const update=()=>{
      const data=dataRef.current;
      const visible=api.timeScale().getVisibleLogicalRange();
      main.setData(data.bars.map(bar=>style==="candles"?{...bar,time:bar.time as UTCTimestamp}:{time:bar.time as UTCTimestamp,value:bar.close}));
      volume.setData(data.bars.map(bar=>({time:bar.time as UTCTimestamp,value:bar.volume,color:bar.close>=bar.open?"#b8f36b35":"#ff849635"})));
      plugin.setMarkers(data.markers.map(trade=>({id:trade.id,time:(Math.floor(trade.time/interval)*interval) as UTCTimestamp,position:"atPriceMiddle",price:Number(trade.fillPrice),shape:trade.side==="buy"?"arrowUp":"arrowDown",color:trade.side==="buy"?"#c7f36b":"#ff8496",text:data.selected===trade.id||data.markers.length<=4?trade.side.toUpperCase():undefined,size:data.selected===trade.id?1.2:.9})) as SeriesMarker<Time>[]);
      if(visible&&fitted)api.timeScale().setVisibleLogicalRange(visible);
      else {
        // Initial React effects can run twice before the chart paints. Fitting
        // after layout prevents the second update restoring the default range.
        cancelAnimationFrame(fitFrame);
        fitFrame=requestAnimationFrame(()=>{const range=sparseMarketRange(dataRef.current.bars.length);if(range)api.timeScale().setVisibleLogicalRange(range);else api.timeScale().fitContent();fitted=true;});
      }
    };
    update();
    const changed=()=>update();root.current.addEventListener("hypr-chart-data",changed);
    const node=root.current;
    api.subscribeClick(event=>{
      const data=dataRef.current;
      if(event.hoveredObjectId&&data.trades.some(trade=>trade.id===event.hoveredObjectId)){data.onSelect(String(event.hoveredObjectId));return;}
      if(typeof event.time==="number") {
        const matches=data.markers.filter(trade=>Math.floor(trade.time/interval)*interval===event.time);
        if(matches.length)data.onSelect(matches[matches.length-1].id);
      }
    });
    let frame=0;
    api.subscribeCrosshairMove(event=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const value=event.seriesData.get(main);
        setHover(value&&"close" in value?`O ${marketPrice(value.open)}  H ${marketPrice(value.high)}  L ${marketPrice(value.low)}  C ${marketPrice(value.close)}`:value&&"value" in value?`${marketPrice(value.value)} test ETH / token`:"");
      });
    });
    return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(fitFrame);node.removeEventListener("hypr-chart-data",changed);plugin.detach();api.remove();chart.current=null;series.current=null;priceLine.current=null;};
  },[style,interval]);
  useEffect(()=>{root.current?.dispatchEvent(new Event("hypr-chart-data"));},[trades,markers,bars,selected]);
  useEffect(()=>{
    const main=series.current,api=chart.current;if(!main||!api)return;
    if(priceLine.current){main.removePriceLine(priceLine.current);priceLine.current=null;}
    const trade=dataRef.current.trades.find(item=>item.id===selected);if(!trade)return;
    priceLine.current=main.createPriceLine({price:Number(trade.fillPrice),color:trade.side==="buy"?"#c7f36b":"#ff8496",lineStyle:LineStyle.Dashed,lineWidth:1,axisLabelVisible:true,title:trade.side.toUpperCase()});
    const index=dataRef.current.bars.findIndex(bar=>bar.time===Math.floor(trade.time/interval)*interval);
    const range=sparseMarketRange(dataRef.current.bars.length);
    if(range)api.timeScale().setVisibleLogicalRange(range);
    else if(index>=0)api.timeScale().setVisibleLogicalRange({from:index-12,to:index+12});
  },[selected,interval,style]);
  function resetView(){const api=chart.current;if(!api)return;api.priceScale("right").applyOptions({autoScale:true});const range=sparseMarketRange(dataRef.current.bars.length);if(range)api.timeScale().setVisibleLogicalRange(range);else api.timeScale().fitContent();}
  return <div className={`market-canvas-wrap ${expanded?"is-expanded":""}`}><div className="market-canvas-toolbar"><span className="market-hover" aria-live="off">{hover||"Price in test ETH · UTC"}</span><div><button type="button" onClick={resetView}>Reset view</button><button type="button" aria-pressed={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"Collapse chart":"Expand chart"}</button></div></div><div className="market-canvas" ref={root} aria-label="Interactive token price chart" role="img"/></div>;
}
