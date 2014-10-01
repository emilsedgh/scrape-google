var async = require('async');
var jsdom = require('jsdom');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var moment = require('moment');

var agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36';
var INTERVAL = 3000;

function _fetch(payload, cb) {
  var r = {
    url:payload.url,
    headers:{
      'User-Agent' : agent
    }
  };

  var fetched = function(err, response, body) {
    if(err) {
      return cb(err);
    }

    if(response.statusCode !== 200) {
      return cb(response.statusCode);
    }

    jsdom.env(body, cb);
  }

  setTimeout(function() {
    request(r, fetched);
  }, INTERVAL);
}
var fetch = async.queue(_fetch, 1);

var Scraper = function(options) {
  var emitter = new EventEmitter;
  emitter.results = [];

  options.start_year = options.start_year;
  options.end_year   = options.end_year;

  emitter.options = options;

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

  var backoffInterval = 300;
  function backoff() {
    console.log('Backing Off', backoffInterval);
    emitter.emit('pause', backoffInterval);
    fetch.pause();

    setTimeout(function() {
      console.log('Resuming');
      emitter.emit('resume');
      emitter.once('fetched page', function() {
        console.log('Resetting backoff interval');
        backoffInterval = 120;
      });
      fetch.resume();
    }, backoffInterval*1000);

    backoffInterval = backoffInterval * 2;
  }

  function scrape(payload, err, window) {
    if(err) {
      if(err == 503) {
//         emitter.emit('error', err, payload);
        backoff();
      }
      fetch.unshift(payload);
      return ;
    }

    emitter.emit('fetched page', payload.page, payload);

    if(payload.page === 0) {
      var last = window.document.querySelector('#nav td:last-child');
      if(last && last.previousSibling)
        emitter.emit('estimate pages', parseInt(last.previousSibling.textContent), payload);
    }

    var $results = window.document.querySelectorAll('#res li h3 a');

    for(var i=0; i<$results.length; i++) {
      var $a = $results.item(i);

      var title = $a.textContent;
      var url = $a.getAttribute('href');

      var result = {
        title:title,
        url:url,
        keyword:payload.keyword,
        start_date:payload.start_date,
        end_date:payload.end_date
      };
      emitter.results.push(result);
      emitter.emit('result', result, payload);
    }

    window.close();

    if($results.length >= 100)
      getResults(payload.keyword, payload.start_date, payload.end_date, payload.page+1, payload.cb)
    else
      payload.cb();
  }

  function start() {
    var fns = [];

    var end  = moment([options.end_year]).endOf('year')
    var step = moment([options.start_year]);
    var next = moment(step).add(1, options.range);

    while(step.valueOf() <= end.valueOf()) {
      fns.push(getResults.bind(null, options.keyword, step.format('l'), next.format('l'), 0));
      step = next.add(1, 'day');
      next = moment(step).add(1, options.range).subtract(1, 'day');
    }

    async.parallel(fns, finish);
  }

  function finish() {
    if(options.callback) options.callback(null, emitter.results);
    emitter.emit('end');
  }

  start();

  return emitter;
}

module.exports = Scraper;