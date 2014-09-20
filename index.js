var async = require('async');
var jsdom = require('jsdom');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Scraper = function(options) {

  var emitter = new EventEmitter;
  var results = [];

  if(!options.concurrency)
    options.concurrency = 1;

  function _fetch(payload, cb) {
    jsdom.env({
      url:payload.url,
      done:cb
    });
  }
  var fetch = async.queue(_fetch, options.concurrency);


  var U = 'https://www.google.com/search?num=100&start=%s&q=%s&source=lnt&tbs=cdr%3A1%2Ccd_min%3A%s%2Ccd_max%3A%s&tbm=';

  function getResults(keyword, start_date, end_date, page, cb) {
    emitter.emit('fetching page', page);

    var u = util.format(U, page*100, encodeURIComponent(keyword), encodeURIComponent(start_date), encodeURIComponent(end_date));

    var payload = {
      url:u,
      keyword:keyword,
      start_date:start_date,
      end_date:end_date,
      page:page,
      cb:cb
    }

    fetch.push(payload, scrape.bind(null, payload));
  }

  function scrape(payload, err, window) {
    emitter.emit('fetched page', payload.page);
    if(err) {
      emitter.emit('error', err);
      return ;
    }

    if(payload.page === 0) {
      var last = window.document.querySelector('#nav td:last-child');
      if(last && last.previousSibling)
        emitter.emit('estimate pages', parseInt(last.previousSibling.textContent));
    }

    var $results = window.document.querySelectorAll('#res li h3 a');
    for(var i=0; i<$results.length; i++) {
      var $a = $results.item(i);

      var title = $a.textContent;
      var url = $a.getAttribute('href');
      var result = {
        title:title,
        url:url,
        page:payload.page
      };
      results.push(result);
      emitter.emit('result', result);
    }

    if($results.length >= 100)
      getResults(payload.keyword, payload.start_date, payload.end_date, payload.page+1, payload.cb)
    else
      payload.cb();
  }

  function start() {
    var fns = [];

    for(var i = options.start_year; i<options.end_year; i++)
      fns.push(getResults.bind(null, options.keyword, '1/1/'+i, '1/1/'+(i+1), 0));

    async.parallel(fns, finish);
  }

  function finish() {
    if(options.callback) options.callback(null, results);
    emitter.emit('end');
  }

  start();

  return emitter;
}

module.exports = Scraper;