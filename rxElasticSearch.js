const elasticsearch = require('elasticsearch');
const rx = require('rxjs/Rx');

const defaultClient = new elasticsearch.Client({
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

const bulkUpdate = client => (observable, toIndex, toType, toId) => {





};

const pushToIndex = client => (observable) => {
    observable.bufferCount(bulkBatchSize)
        .subscribe(batch => {
            const bulkPayload = [];
            batch.forEach(([index, type, id, payload]) => {
                bulkPayload.push(`{ index:  { _index: '${index}', _type: '${type}', _id: ${id} } }`);
                bulkPayload.push(payload);
            });

            client.bulk({body: bulkPayload})
                .then(res => console.log(`res: ${res}`))
                .catch(console.error);
        });
};

export default client => {
    const _client = client || defaultClient;

    const module = {};

    module.streamAll = streamAll(_client);
    module.bulkUpdate = bulkUpdate(_client);


    return module;
}