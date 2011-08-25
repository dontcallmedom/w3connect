var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var People = new Schema({
  w3cId: {type: Number, unique: true},
  given: String,
  family: String,
  email: {type: String, unique: true},
  login: {type: String, unique: true},
  affiliation: Number,
  picture: String,
  picture_thumb: String,
  groups: [Number],
  tags: [String],
  lastKnownPosition: { shortname: {type: String, index: true}, 
		       name: String,
		       time: Date}
});

var Organization = new Schema({
  w3cId: {type: Number, unique: true},
  name: {type: String, unique: true},
  url: {type: String},
  groups: [Number],
  employees: [Number]
});

var Group = new Schema({
  w3cId: {type: Number, unique: true},
  name: {type: String, unique: true},
  url: {type: String, unique: true},
  participants: [Number]
});

var Place = new Schema({
  shortname: {type: String, unique: true},
  name: {type: String, unique: true}
});

var Settings = new Schema({
  w3c_admin_user: String,
  w3c_admin_password: String
});

var TaxiFromAirport = new Schema({
  flight: {airline: String, code: String, eta: Date, airport: {type: String, enum:['San Jose', 'San Francisco', 'Oakland']}, terminal: String},
  maxTime: Date,
  requester: Number,
  sharingOffers: [Number],
  sharing: [Number]
});

var TaxiToAirport = new Schema({
  minTime: Date,
  maxTime: Date,
  airport: {type: String, enum:['San Jose', 'San Francisco', 'Oakland']},
  requester: Number,
  sharingOffers: [Number],
  sharing: [Number]
});

mongoose.model('People', People);
mongoose.model('Organization', Organization);
mongoose.model('Group', Group);
mongoose.model('Place', Place);
mongoose.model('Settings', Settings);
mongoose.model('TaxiToAirport', TaxiToAirport);
mongoose.model('TaxiFromAirport', TaxiFromAirport);
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

exports.Settings = function(db) {
  return db.model('Settings');
};


exports.TaxiToAirport = function(db) {
  return db.model('TaxiToAirport');
};

exports.TaxiFromAirport = function(db) {
  return db.model('TaxiFromAirport');
};
