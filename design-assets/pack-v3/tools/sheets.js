const out=[];for(const c of ['reconnect','receipts','status','estimate','motion'])for(const [w,t] of [[1440,'1440'],[390,'390']])out.push({w,h:900,url:'/pack/tools/sheet.html?c='+c,out:'sheets/'+c+'-'+t+'.png'});
require('./shoot.js')(out);
