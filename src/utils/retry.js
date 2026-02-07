function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function retry(fn, opts={retries:3, minDelay:200, factor:2, onRetry:null}){
  let attempt=0; let delay=opts.minDelay||200;
  while(true){
    try{return await fn();}
    catch(err){
      attempt++;
      if(attempt> (opts.retries||3)) throw err;
      if(opts.onRetry) try{opts.onRetry(err,attempt,delay)}catch(e){}
      await sleep(delay);
      delay = Math.round(delay * (opts.factor||2));
    }
  }
}

module.exports = { retry };
