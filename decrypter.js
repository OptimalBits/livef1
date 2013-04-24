//
// Decrypter Object
//
var INITIAL_DECRYPTION_SALT = 0x55555555;

function Decrypter(key){
  this.key = key;
  this.salt = INITIAL_DECRYPTION_SALT;
}

Decrypter.prototype.decryptShort = function(data){
  if(data.data.length)
  {
    return {data: this.decrypt(data.data), small: data.small, raw:data.data};
  }else{
    return data;
  }
}

Decrypter.prototype.decrypt = function(data){
  if(this.key === 0) return data;
  
  var decrypted = new Buffer(data.length);

  for(var i=0; i<data.length; i++){
    decrypted[i] = this.decryptByte(data[i]);
  }
  
  return decrypted;
}

Decrypter.prototype.decryptByte = function(byte){
 // console.log("byte:"+ byte.toString(16));
//  console.log("salt:"+ this.salt.toString(16));
  
  this.salt = (this.salt >>> 1) ^ ((this.salt & 0x01) ? this.key : 0);
  var decrypted = byte ^ (this.salt & 0xff);
//  console.log("decrypted:"+decrypted.toString(16));
  return decrypted;
}

Decrypter.prototype.reset = function(){
  this.salt = INITIAL_DECRYPTION_SALT;
}

module.exports = Decrypter;