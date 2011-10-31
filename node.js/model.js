var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var People = new Schema({
  slug: {type: String, unique: true},
  given: String,
  family: String,
  email: {type: String, unique: true},
  twitterAccount: {name: String, id: Number},
  login: {type: String, unique: true},
  affiliation: {type: Schema.ObjectId, ref: 'Organization'},
  picture: String,
  picture_thumb: String,
  groups: [{type: Schema.ObjectId, ref: 'Group'}],
  tags: [String],
  lastKnownPosition: { shortname: {type: String, index: true}, 
		       name: String,
		       time: Date}
});

mongoose.model('People', People);


var Organization = new Schema({
  slug: {type: String, unique: true},
  name: {type: String, unique: true},
  url: {type: String},
  groups: [{type: Schema.ObjectId, ref: 'Group'}],
  employees: [{type: Schema.ObjectId, ref: 'People'}]
});

var Group = new Schema({
  slug: {type: String, unique: true},
  name: {type: String, unique: true},
  url: {type: String, unique: true}
});

var Place = new Schema({
  shortname: {type: String, unique: true},
  name: {type: String, unique: true},
  checkedin: [{type: Schema.ObjectId, ref: 'People'}]
});

var StatusUpdate = new Schema({
    author: {type: Schema.ObjectId, ref: 'People'},
    content: String,
    time: Date
});

var Event  = new Schema({
    slug: String,
    registered: [{type: Schema.ObjectId, ref: 'People'}],
    interested: [{type: Schema.ObjectId, ref: 'People'}],
    eventType : {type: String, enum: ["meeting", "adhoc", "meal", "werewolf", "run"]},
    confidentiality: {type: String, enum: ["member", "public"]},
    observers: {type: String, enum: ["chairs", "member", "no"]},
    name: String,
    description: String,
    presenters: String,
    room: {type: Schema.ObjectId, ref: 'Place'},
    timeStart: Date,
    timeEnd: Date
});

/*
var EventRating = new Schema({
    event: {type: Schema.ObjectId, ref:'Event'},
    rating: {type: String, enum: ['interested', 'very interested', "can't miss it", "not interested"]},
    rater: {type: Schema.ObjectId, ref: 'People'}
});*/


var TaxiFromAirport = new Schema({
  flight: {airline: String, code: String, eta: Date, airport: {type: String, enum:['San Jose', 'San Francisco', 'Oakland']}, terminal: String},
  requester: {type: Schema.ObjectId, ref: 'People'},
  sharingOffers: [Number],
  sharing: [Number]
});

mongoose.model('TaxiFromAirport', TaxiFromAirport);

var TaxiToAirport = new Schema({
  minTime: Date,
  maxTime: Date,
  airport: {type: String, enum:['San Jose', 'San Francisco', 'Oakland']},
  requester: {type: Schema.ObjectId, ref: 'People'},
  sharingOffers: [Number],
  sharing: [Number]
});

var TwitterSettings = new Schema({
  list: {
      owner: String,
      slug: String
  },
  username: String,
  password: String,
  ids:  [Number]
});

mongoose.model('Organization', Organization);
mongoose.model('Group', Group);
mongoose.model('Place', Place);
mongoose.model('Event', Event);
//mongoose.model('EventRating', EventRating);
mongoose.model('StatusUpdate', StatusUpdate);
mongoose.model('TaxiToAirport', TaxiToAirport);
mongoose.model('TwitterSettings', TwitterSettings);
exports.People = function(db) {
  return db.model('People');
};

exports.Organization = function(db) {
  return db.model('Organization');
};

exports.Group = function(db) {
  return db.model('Group');
};

exports.Place = function(db) {
  return db.model('Place');
};

exports.StatusUpdate = function(db) {
  return db.model('StatusUpdate');
};


exports.Event = function(db) {
  return db.model('Event');
};

/*
exports.EventRating = function(db) {
  return db.model('EventRating');
};*/

exports.TaxiToAirport = function(db) {
  return db.model('TaxiToAirport');
};

exports.TaxiFromAirport = function(db) {
  return db.model('TaxiFromAirport');
};

exports.TwitterSettings = function(db) {
  return db.model('TwitterSettings');
};
