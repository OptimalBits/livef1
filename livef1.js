"use strict";
var request = require('request');
var when = require('when');
var util = require('util');
var Decrypter = require('./decrypter');

// 
// Globals
//

var HOST = "80.231.178.249";
//var HOST = 'live-timing.formula1.com'
var PORT = 4321;

// Globals
var decrypter;
var decrypt;
var decryptShort;

var sessionId;
var eventType;

var debug = false;

var login = function(username, passwd){
  var deferred = when.defer();
  
  request.post('http://'+HOST+'/reg/login', function(err, req, data){
    if(err){
      deferred.reject(err)
    }else{
      var cookie = request.cookie("USER");
      deferred.resolve(cookie);
    }
  }).form({email:username, password: passwd});
  
  return deferred.promise;
}

function zeroPad(num, places) {
  var zero = places - num.toString().length + 1;
  return Array(+(zero > 0 && zero)).join("0") + num;
}

function readKeyframe(host, num){
  var deferred = when.defer();
  
  var filename = 'keyframe';
  if(num){
    filename += '_'+zeroPad(num, 5);
  }
  filename += '.bin';
  
  var url = 'http://'+host+'/'+filename;
  request(url, {encoding: null}, function(err, res, body){
    if(err){
      deferred.reject(err);
    }else{
      var data = new Buffer(body);
      deferred.resolve(data)
    }
  });
  
  return deferred.promise;
}

function readDecryptionKey(host, sessionId, cookie){
  var deferred = when.defer();
  var url = 'http://'+host+'/reg/getkey/'+sessionId+'.asp?auth='+cookie;
  
  request.get(url, function(err, res, body){
    if(err){
      deferred.reject(err);
    }else{
      debug && console.log("DECRYPTION KEY:", "0x"+body);
      deferred.resolve(parseInt(body, 16));
    }
  });
  
  return deferred.promise;
}

//
// Read data from live stream
//

function readStream(stream, numBytes){
  var deferred = when.defer();
  var data = stream.read(numBytes);
  if(data){
    deferred.resolve(data);
  }else{
    stream.once && stream.once('readable', function(){
      var promise = readStream(stream, numBytes);
      promise.then(function(data){
        deferred.resolve(data);
      });
    });
  }
  return deferred.promise;
}

var EventType = {
  RACE: 1,
  PRACTICE: 2,
  QUALIFYING: 3
};

module.exports.EventType = EventType;

function parseCarPacket(header, stream, eventType){
  switch(eventType){
    case EventType.RACE:
      return parseRacePacket(header, stream);
    case EventType.PRACTICE:
      return parsePracticePacket(header, stream);
    case EventType.QUALIFYING:
      return parseQualifyPacket(header, stream);
  }
  return when.reject(new Error("Unexpected event type:"+eventType));
}

function parsePacket(stream, eventType){
  return parseHeader(stream).then(function(header){
    var carId = header.carId;
    if(carId){
      return parseCarPacket(header, stream, eventType).then(function(packet){
        packet.carId = carId;
        return packet;
      });
    }else{
      return parseSystemPacket(header, stream);
    }
  });
}

var UnknownPacket = {Unknown: 'Unknown Packet'};

//
// Car Packets
//
function parseRacePacket(header, stream){
  switch(header.type){
    case 0: return parsePositionUpdate(header, stream);
    case 1: return parsePosition(header, stream);
    case 2: return parseNumber(header, stream);
    case 3: return parseDriver(header, stream);
    case 4: return parseGap(header, stream);
    case 5: return parseInterval(header, stream);
    case 6: return parseLapTime(header, stream);
    case 7: return parseSector(1, header, stream);
    case 8: return parsePitLap(1, header, stream);
    case 9: return parseSector(2, header, stream);
    case 10: return parsePitLap(2, header, stream);
    case 11: return parseSector(3, header, stream);
    case 12: return parsePitLap(3, header, stream);
    case 13: return parseNumPits(header, stream);
    case 14: return UnknownPacket;
    case 15: return parsePositionHistory(header, stream);
  }
  return when.reject(new Error("Unexpected packet"));
}

function parsePracticePacket(header, stream){
  switch(header.type){
    case 0: return parsePositionUpdate(header, stream);
    case 1: return parsePosition(header, stream);
    case 2: return parseNumber(header, stream);
    case 3: return parseDriver(header, stream);
    case 4: return parseBestLapTime(header, stream);
    case 5: return parseGap(header, stream);
    case 6: return parseSector(1, header, stream);
    case 7: return parseSector(2, header, stream);
    case 8: return parseSector(3, header, stream);
    case 9: return parseLapCount(header, stream);
    case 10: return parseLapCount(header, stream);
    case 15: return UnknownPacket;
  }
  return when.reject(new Error("Unexpected packet"));
}

function parseQualifyPacket(header, stream){
  switch(header.type){
    case 0: return parsePositionUpdate(header, stream);
    case 1: return parsePosition(header, stream);
    case 2: return parseNumber(header, stream);
    case 3: return parseDriver(header, stream);
    case 4: return parsePeriod(1, header, stream);
    case 5: return parsePeriod(2, header, stream);
    case 6: return parsePeriod(3, header, stream);
    case 7: return parseSector(1, header, stream);
    case 8: return parseSector(2, header, stream);
    case 9: return parseSector(3, header, stream);
    case 10: return parseLapCount(header, stream);
    case 15: return UnknownPacket;
  }
  return when.reject(new Error("Unexpected packet"));
}

function parsePositionUpdate(header, stream){
  return parsePacketSpecial(header, stream).then(function(packet){
    return {positionUpdate: packet};
  });
}

function parsePosition(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {position: parseInt(packet.data.toString())};
  });
}

function parseNumber(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {number: parseInt(packet.data.toString()), extra: packet.small};
  });
}

function parseDriver(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {driver: packet.data.toString(), extra: packet.small};
  });
}

function parsePeriod(periodNumber, header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    var period = {};
    period['period'+periodNumber] = packet.data.toString();
    period.extra = packet.small;
    return period;
  });
}

function parseSector(sectorNumber, header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    var sector = {}
    sector['sector'+sectorNumber] = packet.data.toString();
    sector.extra = packet.small;
    return sector;
  });
}

function parseLapCount(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {lapCount: packet.data.toString(), extra: packet.small};
  });
}

function parsePositionHistory(header, stream){
  return parsePacketLong(header, stream).then(decrypt).then(function(packet){
    return {history: packet};
  });
}

function parseGap(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {gap: packet.data.toString(), extra: packet.small};
  });
}

function parseBestLapTime(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {bestLapTime: packet.data.toString(), extra: packet.small};
  });
}

function parseInterval(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {interval: packet.data.toString(), extra: packet.small};
  });
}

function parseLapTime(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {lapTime: packet.data.toString(), extra: packet.small};
  });
}

function parsePitLap(pitLapNumber, header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    var pitLap = {};
    pitLap['pitLap'+pitLapNumber] = packet.data.toString();
    pitLap.extra = packet.small;
    return pitLap;
  });
}

function parseNumPits(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    return {numPits: packet.data.toString(), extra: packet.small};
  });
}

//
// System Packets
//

function parseSystemPacket(header, stream){
  switch(header.type){
    case 0: return UnknownPacket;
    case 1: return parseSessionStart(header, stream);
    case 2: return parseKeyFrame(header, stream);
    case 3: return parseValidMarker(header, stream);
    case 4: return parseCommentary(header, stream);
    case 5: return parseRefreshRate(header, stream);
    case 6: return parseNotice(header, stream);
    case 7: return parseTimestamp(header, stream);
    case 8: return UnknownPacket;
    case 9: return parseWeather(header, stream);
    case 10: return parseSpeed(header, stream);
    case 11: return parseTrackStatus(header, stream);
    case 12: return parseCopyright(header, stream);
    case 13: return UnknownPacket;
    case 14: return UnknownPacket;
    case 15: return UnknownPacket;
  }
  return when.reject(new Error("Unexpected packet"));
}

function parseSessionStart(header, stream, cb){
  return parsePacketShort(header, stream).then(function(packet){
    sessionId = parseInt(packet.data.slice(1).toString());
    return {
      startSession: true,
      sessionId: sessionId,
      eventType: packet.small
    }
  });
}

function parseKeyFrame(header, stream){
  return parsePacketShort(header, stream).then(function(packet){ 
    return {keyframe: packet.data[1] << 8 | packet.data[0]};
  })
}

function parseValidMarker(header, stream){
  return parsePacketSpecial(header, stream).then(function(packet){ 
    return {validMarker: packet};
  })
}

function parseCommentary(header, stream){
  return parsePacketLong(header, stream).then(decrypt).then(function(packet){
    return {commentary: packet.toString().slice(2)};
  });
}

function parseRefreshRate(header, stream){
  return parsePacketSpecial(header, stream).then(function(packet){ 
    return {refreshRate: packet};
  })
}

function parseCopyright(header, stream){
  return parsePacketLong(header, stream).then(function(packet){
    return {copyright: packet.toString()};
  });
}

function parseNotice(header, stream){
  return parsePacketLong(header, stream).then(decrypt).then(function(packet){
    return {notice: packet.toString()};
  });
}

var Speed = {
	SPEED_SECTOR1: 1,
	SPEED_SECTOR2: 2,
	SPEED_SECTOR3: 3,
	SPEED_TRAP: 4,
	FL_CAR: 5,
	FL_DRIVER: 6,
	FL_TIME: 7,
	FL_LAP: 8
}

function parseSpeed(header, stream){
  return parsePacketLong(header, stream).then(decrypt).then(function(packet){
    var data = packet.slice(1);
    switch(packet[0]){
    	case Speed.SPEED_SECTOR1: return {speedSector1: parseSpeedData(data)};
    	case Speed.SPEED_SECTOR2: return {speedSector2: parseSpeedData(data)};
    	case Speed.SPEED_SECTOR3: return {speedSector3: parseSpeedData(data)};
    	case Speed.SPEED_TRAP: return {speedTrap: parseSpeedData(data)};
    	case Speed.FL_CAR: return {fastestLapCar: data.toString()};
    	case Speed.FL_DRIVER: return {fastestLapDriver: data.toString()};
    	case Speed.FL_TIME: return {fastestLapTime: data.toString()};
    	case Speed.FL_LAP: return {fastestLapLap: data.toString()};
    }
  });
}

function parseSpeedData(data){
  var str = data.toString().trim().split('\r');
  var result = {};
  for(var i=0; i<str.length; i+=2){
    result[str[i]] = str[i+1];
  }
  return result;
}

function parseTimestamp(header, stream){
  return parsePacketTimestamp(header, stream).then(decrypt).then(function(packet){
    return {timestamp: (packet[1] << 8) | packet[0]};
  });
}

var TrackStatus = [
  'UNKNOWN_STATUS',
  'GREEN_FLAG',
  'YELLOW_FLAG',
  'SAFETY_CAR_STANDBY',
  'SAFETY_CAR_DEPLOYED',
  'RED_FLAG'
];
    
function parseTrackStatus(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    var trackStatus = {};
    trackStatus[TrackStatus[packet.small]] = packet.data.toString();
    return {trackStatus: trackStatus};
  });
}

var Weather = [
  'SESSION_CLOCK',
  'TRACK_TEMP', 
  'AIR_TEMP', 
  'WET_TRACK',
  'WIND_SPEED',
  'HUMIDITY',
  'PRESSURE',
  'WIND_DIRECTION'
];

function parseWeather(header, stream){
  return parsePacketShort(header, stream).then(decryptShort).then(function(packet){
    var weatherPacket = {};
    weatherPacket[Weather[packet.small]] = packet.data.toString();
    return {weather: weatherPacket};
  });
}

/// _byte2           _byte1
/// [0|1|2|3|4|5|6|7][0|1|2|3|4|5|6|7]
///  +-data------+ +-type-+ +-carid-+
function parseHeader(stream){
  return readStream(stream, 2).then(function(data){
    var header = {
      carId: data[0] & 0x1F,
      type: (data[0] >> 5) | ((data[1] & 0x01) << 3),
      data: data[1] >> 1
    }
    debug && console.log("HEADER:"+util.inspect(header));
    return header;
  });
}

//  _p[1]            _p[0]
// [ | | | | | | | ][ | | | | | | | ]
//  +-len-+ +-d-+ +-type-+ +-carid-+
function parsePacketShort(header, stream){
  var length = header.data >> 3; 
  var small = header.data & 0x07;
  var data;
    
  if(length != 0 && length != 15){
    return readStream(stream, length).then(function(data){
      return {data: data, small: small};
    });
  }else{
    return when.resolve({data: 0, small: small});
  }
}

function parsePacketLong(header, stream){
  return readStream(stream, header.data);
}

function parsePacketSpecial(header){
  return when.resolve(header.data);
}

function parsePacketTimestamp(header, stream){
  return readStream(stream, 2);
}

var usedKeyframe = false;
var parseStream = function(buffer, cookie, cb){  
  return parsePacket(buffer, eventType).then(function(packet){
  
    if(sessionId){
      packet = packet || {};
      packet.sessionId = sessionId;
    }
      
    cb(packet);
            
    if(packet.eventType){
      eventType = packet.eventType;
    }
    
    if(packet.keyframe){
      decrypter && decrypter.reset();
      if(!usedKeyframe){
        readKeyframe(HOST, packet.keyframe).then(function(keyframe){
          usedKeyframe = true;
          streamify(keyframe);
          return parseStream(keyframe, cookie, cb).then(function(){
            return parseStream(buffer, cookie, cb);
          }).otherwise(function(err){
            console.log("Error Parsing Keyframe", err);
          })
        });
      }else{
        return parseStream(buffer, cookie, cb);
      }
    }else if(packet.startSession){
      readDecryptionKey(HOST, packet.sessionId, cookie).then(function(key){
        console.log("DECRYPTION KEY:", key);
        decrypter = new Decrypter(key);
        decrypt = decrypter.decrypt.bind(decrypter);
        decryptShort = decrypter.decryptShort.bind(decrypter);
        return parseStream(buffer, cookie, cb);
      });
    }else{
      return parseStream(buffer, cookie, cb);
    }
  });
}

//
// Streamify a Buffer
//
var streamify = function(buffer){
  buffer.readOffset = 0;
  buffer.read = function(numBytes){
    if(buffer.readOffset + numBytes < buffer.length){
      var slice = buffer.slice(buffer.readOffset, buffer.readOffset+numBytes);
      buffer.readOffset += numBytes;
      return slice;
    }
  }
}

//
// Export main.
//
module.exports = function(user, passwd, cb){
  return login(user, passwd).then(function(cookie){
    var net = require('net');

    var liveStream = new net.Socket();

    liveStream.connect(PORT, HOST, function(){
      console.log('client connected');
  
      // Write 0x10 every second to force server to continue sending data.
      setInterval(function(){
        liveStream.write(new Buffer(0x10));
      }, 1000);
    });

    liveStream.on('end', function() {
      console.log('client disconnected');
    });
    
    liveStream.on('error', function(err){
      console.log('client error:', err);
      liveStream.destroy();
      
      // TODO: How do we handle a connection error?
    });
  
    return parseStream(liveStream, cookie, cb);
  });
}

module.exports.login = login;
module.exports.streamify = streamify;
module.exports.parseStream = parseStream;


