import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MARK, MapOverlay, mapStyles, type MapProps } from './parts';

// MapLibre GL + OpenStreetMap inside a WebView. Used in Expo Go, whose built-in Google Maps key is rejected
// (observed: "Authorization failure … host.exp.exponent"); needs no key at all.
const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>html,body,#m{margin:0;height:100%;background:#eaf0f5}</style></head><body><div id="m"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function(){
 var post=function(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m))};
 if(!window.maplibregl){post({type:'error',message:'Map library could not load (offline?).'});return}
 var map=new maplibregl.Map({container:'m',style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:[106.8456,-6.2088],zoom:10,attributionControl:false});
 // Attribution bottom-left: bottom-right holds the my-location button.
 map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');
 map.touchPitch.disable();map.dragRotate.disable();map.touchZoomRotate.disableRotation();
 var ready=false,pending=null,fitKey=null,last=null,ll=function(p){return [p[1],p[0]]};
 var line=function(c,props){return {type:'Feature',properties:props,geometry:{type:'LineString',coordinates:c.map(ll)}}};
 var src=function(id,data){var s=map.getSource(id);s?s.setData(data):map.addSource(id,{type:'geojson',data:data})};
 function fit(animate){if(!last)return;var all=[].concat.apply([],last.routes.map(function(r){return r.coords||[]})).concat(last.trail,last.points.filter(function(p){return p.kind!=='here'}).map(function(p){return p.at}));
  if(all.length){var b=new maplibregl.LngLatBounds(ll(all[0]),ll(all[0]));all.forEach(function(c){b.extend(ll(c))});map.fitBounds(b,{padding:{top:56,right:64,bottom:24,left:24},maxZoom:15,duration:animate?400:0})}}
 function draw(spec){
  last=spec;
  src('routes',{type:'FeatureCollection',features:spec.routes.filter(function(r){return r.coords&&r.coords.length>1}).map(function(r){return line(r.coords,{selected:r.selected})})});
  src('trail',{type:'FeatureCollection',features:spec.trail.length>1?[line(spec.trail,{})]:[]});
  src('points',{type:'FeatureCollection',features:spec.points.map(function(p){return {type:'Feature',properties:{kind:p.kind},geometry:{type:'Point',coordinates:ll(p.at)}}})});
  if(!map.getLayer('routes-other')){
   map.addLayer({id:'routes-other',type:'line',source:'routes',filter:['==',['get','selected'],false],paint:{'line-color':'#94a3b8','line-width':4,'line-opacity':.8},layout:{'line-cap':'round','line-join':'round'}});
   map.addLayer({id:'routes-selected',type:'line',source:'routes',filter:['==',['get','selected'],true],paint:{'line-color':'#0B5FFF','line-width':6,'line-opacity':.55},layout:{'line-cap':'round','line-join':'round'}});
   map.addLayer({id:'trail',type:'line',source:'trail',paint:{'line-color':'#0E7490','line-width':4}});
   map.addLayer({id:'here-halo',type:'circle',source:'points',filter:['==',['get','kind'],'here'],paint:{'circle-radius':18,'circle-color':'${MARK.here.color}','circle-opacity':.2}});
   map.addLayer({id:'points',type:'circle',source:'points',paint:{'circle-radius':['match',['get','kind'],'here',9,7],'circle-color':['match',['get','kind'],'here','${MARK.here.color}','origin','${MARK.origin.color}','${MARK.stop.color}'],'circle-stroke-color':'#fff','circle-stroke-width':3}});
  }
  if(fitKey!==spec.fitKey){fitKey=spec.fitKey;fit(false)}
 }
 window.render=function(spec){ready?draw(spec):(pending=spec)};
 window.cmd=function(c){
  if(c==='in'||c==='out')map.easeTo({zoom:map.getZoom()+(c==='in'?1:-1),duration:200});
  if(c==='fit')fit(true);
  if(c==='here'&&last){var h=last.points.filter(function(p){return p.kind==='here'})[0];if(h)map.easeTo({center:ll(h.at),zoom:Math.max(map.getZoom(),15),duration:400})}
 };
 map.on('load',function(){ready=true;if(pending)draw(pending);post({type:'ready'})});
 map.on('error',function(e){post({type:'error',message:String(e&&e.error&&e.error.message||'map error')})});
})();
</script></body></html>`;

export function WebMap({ spec, height = 260 }: MapProps) {
  // WebView's generic defaults to `undefined`, which makes its props `never` under strict TS; `object` restores them.
  const ref = useRef<WebView<object>>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const send = () => { if (spec) ref.current?.injectJavaScript(`window.render&&window.render(${JSON.stringify(spec)});true;`); };
  const cmd = (c: 'in' | 'out' | 'fit' | 'here') => ref.current?.injectJavaScript(`window.cmd&&window.cmd('${c}');true;`);
  useEffect(send, [spec]);
  return (
    <View style={[mapStyles.box, { height }]}>
      {failed ? <View style={mapStyles.center}><Text style={mapStyles.msg}>Map unavailable. {failed}</Text></View> : <>
        {/* nestedScrollEnabled: on Android the page ScrollView would otherwise take drags meant to pan the map. */}
        <WebView<object> ref={ref} originWhitelist={['*']} source={{ html: HTML, baseUrl: 'https://kilometric.app/' }} onLoadEnd={send} scrollEnabled={false} nestedScrollEnabled
          onMessage={(e: WebViewMessageEvent) => { try { const m = JSON.parse(e.nativeEvent.data); if (m.type === 'error' && !m.message.includes('tile')) setFailed(m.message); if (m.type === 'ready') send(); } catch {} }}
          onError={() => setFailed('Check your internet connection.')} />
        <MapOverlay spec={spec} onZoom={d => cmd(d > 0 ? 'in' : 'out')} onFit={() => cmd('fit')} onHere={() => cmd('here')} />
      </>}
    </View>
  );
}
