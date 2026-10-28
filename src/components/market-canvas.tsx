"use client";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {createChart,AreaSeries,CandlestickSeries,HistogramSeries,createSeriesMarkers,ColorType,CrosshairMode,LineStyle,type IChartApi,type ISeriesApi,type IPriceLine,type UTCTimestamp,type SeriesMarker,type Time,type AutoscaleInfo} from "lightweight-charts";
import {marketCandles,marketPrice,includeFillPrices,type MarketTrade} from "@/lib/market";

export default function MarketCanvas({trades,markers,interval,style,selected,onSelect}:{trades:MarketTrade[];markers:MarketTrade[];interval:number;style:"line"|"candles";selected:string|null;onSelect:(id:string)=>void}) {
  const root=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),series=useRef<ISeriesApi<"Area"|"Candlestick">|null>(null),priceLine=useRef<IPriceLine|null>(null);
  const [hover,setHover]=useState("");
  const bars=useMemo(()=>marketCandles(trades,interval),[trades,interval]);
  const dataRef=useRef({trades,markers,bars,onSelect,selected});dataRef.current={trades,markers,bars,onSelect,selected};
  useEffect(()=>{
    if(!root.current)return;
    const api=createChart(root.current,{autoSize:true,height:330,layout:{background:{type:ColorType.Solid,color:"#101419"},textColor:"#aab4c3",fontFamily:"system-ui, sans-serif",attributionLogo:true},grid:{vertLines:{color:"#ffffff06"},horzLines:{color:"#ffffff09"}},crosshair:{mode:CrosshairMode.Normal},rightPriceScale:{borderColor:"#ffffff14",minimumWidth:86,scaleMargins:{top:.2,bottom:.26}},timeScale:{borderColor:"#ffffff14",timeVisible:true,secondsVisible:interval===1,rightOffset:4},handleScroll:{vertTouchDrag:false},localization:{priceFormatter:(price:number)=>marketPrice(price)}});
    const main=style==="candles"?api.addSeries(CandlestickSeries,{upColor:"#b8f36b",downColor:"#ff8496",wickUpColor:"#b8f36b",wickDownColor:"#ff8496",borderVisible:false}):api.addSeries(AreaSeries,{lineColor:"#c7f36b",topColor:"#c7f36b2a",bottomColor:"#c7f36b00",lineWidth:2});
    main.applyOptions({priceFormat:{type:"custom",formatter:(price:number)=>marketPrice(price),minMove:1e-12},autoscaleInfoProvider:(base:()=>AutoscaleInfo|null)=>{
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
    const update=()=>{
      const data=dataRef.current;
      const visible=api.timeScale().getVisibleLogicalRange();
      main.setData(data.bars.map(bar=>style==="candles"?{...bar,time:bar.time as UTCTimestamp}:{time:bar.time as UTCTimestamp,value:bar.close}));
      volume.setData(data.bars.map(bar=>({time:bar.time as UTCTimestamp,value:bar.volume,color:bar.close>=bar.open?"#b8f36b35":"#ff849635"})));
      plugin.setMarkers(data.markers.map(trade=>({id:trade.id,time:(Math.floor(trade.time/interval)*interval) as UTCTimestamp,position:"atPriceMiddle",price:Number(trade.fillPrice),shape:trade.side==="buy"?"arrowUp":"arrowDown",color:trade.side==="buy"?"#c7f36b":"#ff8496",text:data.selected===trade.id?`${trade.side.toUpperCase()} ${marketPrice(trade.fillPrice)}`:undefined,size:data.selected===trade.id?1.8:1})) as SeriesMarker<Time>[]);
      if(visible)api.timeScale().setVisibleLogicalRange(visible);else api.timeScale().fitContent();
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
    return()=>{cancelAnimationFrame(frame);node.removeEventListener("hypr-chart-data",changed);plugin.detach();api.remove();chart.current=null;series.current=null;priceLine.current=null;};
  },[style,interval]);
  useEffect(()=>{root.current?.dispatchEvent(new Event("hypr-chart-data"));},[trades,markers,bars,selected]);
  useEffect(()=>{
    const main=series.current,api=chart.current;if(!main||!api)return;
    if(priceLine.current){main.removePriceLine(priceLine.current);priceLine.current=null;}
    const trade=dataRef.current.trades.find(item=>item.id===selected);if(!trade)return;
    priceLine.current=main.createPriceLine({price:Number(trade.fillPrice),color:trade.side==="buy"?"#c7f36b":"#ff8496",lineStyle:LineStyle.Dashed,lineWidth:1,axisLabelVisible:true,title:`${trade.side.toUpperCase()} fill`});
    const index=dataRef.current.bars.findIndex(bar=>bar.time===Math.floor(trade.time/interval)*interval);
    if(dataRef.current.bars.length<=24)api.timeScale().fitContent();
    else if(index>=0)api.timeScale().setVisibleLogicalRange({from:index-12,to:index+12});
  },[selected,interval,style]);
  return <div className="market-canvas-wrap"><div className="market-hover" aria-live="off">{hover||"Drag to explore · pinch to zoom · tap a trade marker"}</div><div className="market-canvas" ref={root} aria-label="Interactive token price chart" role="img"/><button className="market-fit" type="button" onClick={()=>chart.current?.timeScale().fitContent()}>Fit chart</button></div>;
}
