const rxEs = require('./rxElasticSearch');
const faker = require('faker');
const rx = require('rxjs/Rx');

const esClient = rxEs();

const getData = id => ({
    _id: id,
    _type: 'foo',
    _index: 'widget',
    _source: {
        id,
        name: "test",
        message:faker.random.words()
    }
});

const dataGenerator = rx.Observable.range(1, 100)
    .map(getData);

const dataGenerator2 = rx.Observable.range(101, 200)
    .map(getData);

esClient.pushToIndex(dataGenerator);
esClient.pushToIndex(dataGenerator2);

