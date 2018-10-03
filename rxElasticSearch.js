const elasticsearch = require('elasticsearch');
const rx = require('rxjs/Rx');
const stats = require('./stats');
const moment = require('moment');

const getDefaultClient = () =>  new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'warning'
});

const bulkBatchSize = 10;

const scrollToEnd = (res, scroll, batchSize, client, observer) => {
    if (res.timed_out) {
        return observer.error(new Error('Search timed out'));
    }

    const emitHits = hits =>
        hits.map(hit => hit._source)
            .forEach(source => observer.next(source));

    const hits = res.hits.hits;
    const scrollId = res._scroll_id;
    if (hits.length < batchSize) {
        if (hits.length > 0) {
            emitHits(hits);
        }

        observer.complete();
        if (scrollId) client.clearScroll({scrollId})
            .catch(console.error);
        return;
    }

    emitHits(hits);

    if (!observer.completed) {
        client.scroll({scroll, scrollId})
            .then(batchRes => scrollToEnd(batchRes, scroll, batchSize, client, observer))
            .catch(observer.error);
    }
};

const streamAll = client => searchBody => {
    const defaults = {
        size: 20,
        scroll: '30s'
    };
    const body = Object.assign({}, defaults, searchBody);
    return new rx.Observable.create(observer => {
        let completed = false;
        client.search(body)
            .then(res => scrollToEnd(res, body.scroll, body.size, client, observer))
            .catch(error => observer.error(error));
        return () => observer.completed = true;
    });
};

const pushToIndex = (client, updateSubject) => observable => {
    const start = moment();
    observable.subscribe(indexRecord => {
        updateSubject.next([start, indexRecord]);
    });
};

const subscribeToUpdater = (client, updateSubject) => {
    rx.Observable.create(emitter => {
        updateSubject.subscribe(([startTime, indexRecord]) => {
            emitter.next([startTime, indexRecord]);
        })
    }).bufferCount(bulkBatchSize)
        .mergeMap(batch => {
            const bulkPayload = [];
            const startTimes = [];
            batch.forEach(([startTime, indexRecord]) => {
                bulkPayload.push(`{ "index":  { "_index": "'${indexRecord._index}'", "_type": "'${indexRecord._type}'", "_id": "${indexRecord._id}" } }`);
                bulkPayload.push(indexRecord._source);
                startTimes.push(startTime);
            });

            return rx.Observable.combineLatest(rx.Observable.of(startTimes), client.bulk({body: bulkPayload}));
        }).subscribe(([startTimes, res]) => {
            startTimes.forEach(startTime => stats.statSubjects.timeToIndex.next(moment.duration(moment().diff(startTime)).get('milliseconds')));
            stats.registerStat('indexed', res.items.length);
        });
};

module.exports = (client = getDefaultClient()) => {
    const updateSubject = new rx.Subject();
    subscribeToUpdater(client, updateSubject);

    const module = {};

    module.streamAll = streamAll(client);
    module.pushToIndex = pushToIndex(client, updateSubject);

    return module;
};
