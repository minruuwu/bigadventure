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
      for(var xx=0;xx<W2;xx++){var px=side==='l'?xx:W2-1-xx;if(px<cut)continue;if(px===cut){x.fillStyle='#241610'}else if(px===cut+1){x.fillStyle='#3b2713'}else{x.fillStyle=r()<.12?'#5a3a1c':'#4a2f16'}x.fillRect(xx,y,1,1)}}
    return 'url('+c.toDataURL()+')'}
  function stainTile(){var c=document.createElement('canvas');c.width=c.height=96;var x=c.getContext('2d');var sd=17;function r(){sd=(sd*9301+49297)%233280;return sd/233280}
    for(var i=0;i<9;i++){var cx=r()*96,cy=r()*96,rad=5+r()*9,col=r()<.3?'rgba(150,80,25,':'rgba(110,70,25,';
      for(var y=Math.floor(cy-rad-2);y<=cy+rad+2;y++)for(var xx=Math.floor(cx-rad-2);xx<=cx+rad+2;xx++){var d=Math.hypot(xx-cx,y-cy);var X=(xx+96)%96,Y=(y+96)%96;
        if(d<rad*.7){x.fillStyle=col+'.20)';x.fillRect(X,Y,1,1)}else if(d<rad&&(xx+y)%2===0){x.fillStyle=col+'.20)';x.fillRect(X,Y,1,1)}else if(d<rad+1.5&&d>=rad&&r()<.5){x.fillStyle='rgba(70,40,15,.26)';x.fillRect(X,Y,1,1)}}}
    return 'url('+c.toDataURL()+')'}
  /* 角色頁書頁用：深色破邊疊在紙上，內側邊緣也不規則（5 格寬；紙那側透明） */
  function edgeTile2(side){var W2=5,H2=32,c=document.createElement('canvas');c.width=W2;c.height=H2;var x=c.getContext('2d');var sd=side==='l'?5:13;function r(){sd=(sd*9301+49297)%233280;return sd/233280}
    var e=1,d=3;for(var y=0;y<H2;y++){var q=r();if(q<.2)e=Math.max(0,e-1);else if(q<.42)e=Math.min(1,e+1);q=r();if(q<.28)d=Math.max(2,d-1);else if(q<.56)d=Math.min(4,d+1);var dd=d;if(r()<.07)dd=Math.max(2,d-1);
      for(var xx=0;xx<W2;xx++){var px=side==='l'?xx:W2-1-xx;if(px<e||px>dd)continue;x.fillStyle=px===e?'#241610':px===dd?'#5a3a1c':(r()<.12?'#5a3a1c':'#3b2713');x.fillRect(xx,y,1,1)}}
    return 'url('+c.toDataURL()+')'}
  function edgeTileH(side){var W2=32,H2=5,c=document.createElement('canvas');c.width=W2;c.height=H2;var x=c.getContext('2d');var sd=side==='t'?21:34;function r(){sd=(sd*9301+49297)%233280;return sd/233280}
    var d=3;for(var xx=0;xx<W2;xx++){var q=r();if(q<.28)d=Math.max(2,d-1);else if(q<.56)d=Math.min(4,d+1);var dd=d;if(r()<.07)dd=Math.max(2,d-1);
      for(var yy=0;yy<H2;yy++){var py=side==='t'?yy:H2-1-yy;if(py>dd)continue;x.fillStyle=py===0?'#241610':py===dd?'#5a3a1c':(r()<.12?'#5a3a1c':'#3b2713');x.fillRect(xx,yy,1,1)}}
    return 'url('+c.toDataURL()+')'}

  /* 創角頁風格的像素紙：5 階色、Bayer 抖動、細碎斑點、水漬圈；256px 可無縫平鋪，每格 4px */
  function paperTile(){var N=64,B=4,PAL=['#e0c795','#d3b480','#c4a06c','#b08a56','#97723f'],c=document.createElement('canvas');c.width=c.height=N*B;var x=c.getContext('2d');
    var sd=7;function r(){sd=(sd*16807)%2147483647;return sd/2147483647}
    var BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    var P=[[1,2,0.0],[2,1,1.7],[3,2,3.1],[2,3,4.4],[4,1,5.5],[1,4,2.2]];
    function nz(cc,rr){var v=0;for(var i=0;i<P.length;i++){v+=Math.sin(2*Math.PI*(P[i][0]*cc+P[i][1]*rr)/N+P[i][2])}return (v/P.length)*0.5+0.5}
    var T=[];for(var rr=0;rr<N;rr++){T[rr]=[];for(var cc=0;cc<N;cc++){var n=nz(cc,rr),t=Math.round(n*2.2+(BAY[(rr&3)*4+(cc&3)]/16-0.5)*0.9);var q=r();if(q<.035)t++;else if(q>.988)t--;T[rr][cc]=t}}
    for(var y=0;y<N;y++)for(var x2=0;x2<N;x2++){var v=Math.max(0,Math.min(4,T[y][x2]));x.fillStyle=PAL[v];x.fillRect(x2*B,y*B,B,B)}
    return 'url('+c.toDataURL()+')'}
  /* 創角頁式的紙：左上提亮、右下偏暗的像素分帶（每格 4px），回傳 background-image 用的 url() */
  window.PaperLit=function(W,H,seed,lx,ly){var B=4,cols=Math.ceil(W/B),rows=Math.ceil(H/B),PAL=['#e0c795','#d3b480','#c4a06c','#b08a56','#97723f'].map(function(h){var n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255]}),BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    var sd=seed|0;function rng(){sd=sd+0x6D2B79F5|0;var t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}
    var c=document.createElement('canvas');c.width=cols;c.height=rows;var x=c.getContext('2d'),img=x.createImageData(cols,rows),d=img.data,LX=lx/B,LY=ly/B,LR=Math.max(cols,rows)*1.2;
    for(var r=0;r<rows;r++)for(var cc=0;cc<cols;cc++){var dd=Math.sqrt((cc-LX)*(cc-LX)+((r-LY)*1.1)*((r-LY)*1.1))/LR,lc=Math.max(0,1-dd),bay=BAY[(r&3)*4+(cc&3)]/16;
      var tone=3-Math.max(0,Math.min(3,Math.round(lc*3.2+(bay-0.5)*0.9))),q=rng();if(q<0.035)tone++;else if(q>0.988)tone--;tone=Math.max(0,Math.min(4,tone));
      var col=PAL[tone],o=(r*cols+cc)*4;d[o]=col[0];d[o+1]=col[1];d[o+2]=col[2];d[o+3]=255}
    x.putImageData(img,0,0);return 'url('+c.toDataURL()+')'};
  var R=document.documentElement.style;R.setProperty('--paperT',paperTile());R.setProperty('--wearP',tile('paper'));R.setProperty('--edgeL',edgeTile('l'));R.setProperty('--edgeR',edgeTile('r'));R.setProperty('--edgeT2',edgeTileH('t'));R.setProperty('--edgeB2',edgeTileH('b'));R.setProperty('--edgeL2',edgeTile2('l'));R.setProperty('--edgeR2',edgeTile2('r'));R.setProperty('--stainP',stainTile())}catch(e){}})();
