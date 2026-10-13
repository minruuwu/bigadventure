/* 破舊羊皮紙材質（取自鍛造頁的附魔卷軸）：設定 --wearP / --edgeL / --edgeR / --stainP 在 :root */
(function(){try{function tile(kind){var c=document.createElement('canvas');c.width=c.height=48;var x=c.getContext('2d');var seed=kind==='paper'?11:23;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}
  function dot(col,n){x.fillStyle=col;for(var i=0;i<n;i++)x.fillRect(Math.floor(rnd()*48),Math.floor(rnd()*48),1,1)}
  if(kind==='paper'){dot('rgba(0,0,0,.26)',40);dot('rgba(255,230,180,.10)',24);dot('rgba(190,90,30,.14)',12);
    for(var ci=0;ci<3;ci++){var cx=Math.floor(rnd()*40),cy=Math.floor(rnd()*40),cl=8+Math.floor(rnd()*8);x.fillStyle='rgba(50,25,8,.22)';for(var cj=0;cj<cl;cj++){cx+=(rnd()<.55?1:0);cy+=(rnd()<.55?1:0)+(rnd()<.2?-1:0);x.fillRect(cx%48,Math.abs(cy)%48,1,1)}}
    for(var i=0;i<3;i++){var bx=Math.floor(rnd()*42),by=Math.floor(rnd()*42);x.fillStyle='rgba(120,70,20,.14)';x.fillRect(bx,by,4,3);x.fillRect(bx+1,by-1,2,1)}}
  else if(kind==='wood'){dot('rgba(0,0,0,.34)',60);dot('rgba(255,220,170,.09)',34);dot('rgba(0,0,0,.22)',24);for(var wi=0;wi<4;wi++){var wy=Math.floor(rnd()*46);x.fillStyle='rgba(0,0,0,.18)';x.fillRect(Math.floor(rnd()*20),wy,10+Math.floor(rnd()*20),1)}}
  else if(kind==='copper'){dot('rgba(20,8,2,.38)',60);dot('rgba(255,200,150,.14)',40);dot('rgba(70,150,120,.30)',10);dot('rgba(0,0,0,.25)',20)}
  else{dot('rgba(0,0,0,.34)',70);dot('rgba(200,220,255,.10)',60);dot('rgba(190,95,35,.28)',9);
    for(var i2=0;i2<5;i2++){var px=Math.floor(rnd()*38),py=Math.floor(rnd()*44),len=4+Math.floor(rnd()*5);x.fillStyle='rgba(205,225,255,.20)';for(var j=0;j<len;j++)x.fillRect(px+j,py+(j>>1),1,1)}
    for(var i3=0;i3<4;i3++){var qx=Math.floor(rnd()*44),qy=Math.floor(rnd()*44);x.fillStyle='rgba(0,0,0,.30)';x.fillRect(qx,qy,2,2)}}
  return 'url('+c.toDataURL()+')'}
  function edgeTile(side){var W2=4,H2=32,c=document.createElement('canvas');c.width=W2;c.height=H2;var x=c.getContext('2d');var sd=side==='l'?3:9;function r(){sd=(sd*9301+49297)%233280;return sd/233280}
    var e=1;for(var y=0;y<H2;y++){var rr=r();if(rr<.16)e=Math.max(0,e-1);else if(rr<.34)e=Math.min(2,e+1);var cut=e;if(r()<.05)cut=Math.min(3,e+1);
      for(var xx=0;xx<W2;xx++){var px=side==='l'?xx:W2-1-xx;if(px<cut)continue;if(px===cut){x.fillStyle='#3b2713'}else if(px===cut+1){x.fillStyle='#8a5e2c'}else{x.fillStyle=r()<.08?'#c7a96e':'#d9c08a'}x.fillRect(xx,y,1,1)}}
    return 'url('+c.toDataURL()+')'}
  function stainTile(){var c=document.createElement('canvas');c.width=c.height=96;var x=c.getContext('2d');var sd=17;function r(){sd=(sd*9301+49297)%233280;return sd/233280}
    for(var i=0;i<9;i++){var cx=r()*96,cy=r()*96,rad=5+r()*9,col=r()<.3?'rgba(150,80,25,':'rgba(110,70,25,';
      for(var y=Math.floor(cy-rad-2);y<=cy+rad+2;y++)for(var xx=Math.floor(cx-rad-2);xx<=cx+rad+2;xx++){var d=Math.hypot(xx-cx,y-cy);var X=(xx+96)%96,Y=(y+96)%96;
        if(d<rad*.7){x.fillStyle=col+'.20)';x.fillRect(X,Y,1,1)}else if(d<rad&&(xx+y)%2===0){x.fillStyle=col+'.20)';x.fillRect(X,Y,1,1)}else if(d<rad+1.5&&d>=rad&&r()<.5){x.fillStyle='rgba(70,40,15,.26)';x.fillRect(X,Y,1,1)}}}
    return 'url('+c.toDataURL()+')'}
  var R=document.documentElement.style;R.setProperty('--wearP',tile('paper'));R.setProperty('--edgeL',edgeTile('l'));R.setProperty('--edgeR',edgeTile('r'));R.setProperty('--stainP',stainTile())}catch(e){}})();
