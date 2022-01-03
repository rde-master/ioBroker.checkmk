// @ts-nocheck
/**
  * @file Check_MK for NODEJS (checkMK)
  * @autor Alfredo Roman Domiguez <alfredoromandominguez@gmail.com> 
  * @example
  * let check = require('checkMK');
  * 
  * let  options = {
  *    host:  '192.168.72.20'    
  * }
  * check.createServer(options);
  * check.addService('prueba',{name: 'prueba'});
  * check.addService('prueba2',{
  *  name: 'prueba2',
  *  ok: 'prueba 2',
  *  counter: {
  *	linea : '9;2;3;0;10',
  *	linea2: '1;2;7'
  *  }
  *})
  * ...
  * ...
  *  check.updateService('prueba2',{
  *	linea : 9,
  *	linea2: 1
  *  });
  */

/** extenal libs  */
const lib = {
    net : require('net')
}

/** Default vars */
let _cmk = {
    start : Date.now()/1000,
    version:  '0.1',
    agent:  'ioBroker.checkmk',
    host: '127.0.0.1',
    port: 6556,
    exclusive: true,
    encodign: 'utf8',
    local: {},
    services: [ 'Status' ],
    error: {
	E_ADD_ARGUMENTS: 'Error, not running whitOut Arguments.',
	E_ADD_NOT_JSON:  'Error, options need json.',
	E_ADD_SECURITY:  'Error, options not good format',
	E_UPD_SERVICE:   'Error, Service not exist',
	E_ADD_CRI:       'service Unknow',
	E_ADD_WAR:       'service Unknow',
	E_ADD_OK:        'service Unknow',
    }
};
/** default var in client */
/*if ( process.env.npm_package_version!== undefined){
    _cmk.version = 'Package '+process.env.npm_package_version;
    _cmk.agent += ' '+process.env.npm_config_node_version;
    _cmk.host = process.env.COMPUTERNAME;
}

*/
/** Base structure checkMK */
const _check_mk = '<<<check_mk>>>'+"\n"+
      'Version: '+_cmk.version+"\n"+
      'AgentOS: '+_cmk.agent+"\n"+
      'Hostname:'+_cmk.host+"\n";


/** Local services 
_cmk.local.Status = {
    counter: {},
    ok: 'In Line Status OK',
    warning: '',
    critial: ''    
};
*/
/**
 * check MK server
 *
 * @constructor
 * @param {json} settings 
 * @json {string} host - ip host listener
 * @json {int} port - Port of listener
 * @json {true|false} exclusive - Mod of net server
 * @json {string}  encoding - Type of encoding
*/

function createServer(settings){
    
    settings.host = settings.host || _cmk.host;
    settings.port = settings.port || _cmk.port;
    settings.exclusive =  settings.exclusive || _cmk.exclusive;
    settings.encoding = settings.encoding || _cmk.encoding;
    
    let _other_settings = {};
    _other_settings.encoding = settings.encoding;
    delete settings.encoding;
       
    const _server = lib.net.createServer();

    _server.listen(settings);
    

    _server.on('connection',function(_socket){
	
	_socket.setEncoding(_other_settings.encoding);
	
	let uptime = '<<<uptime>>>'+"\n"+
	    ((Date.now()/1000)-_cmk.start)+"\n";

	let local =  '<<<local>>>'+"\n";
	for( let id in _cmk.local){
	    local += serviceTXT(id)+"\n";
	}
	
	_socket.write(_check_mk + uptime + local);
	//_socket.write(uptime);
	//_socket.write(local);
	_socket.end();

     
    
    });  
    return _server;
}

function serverClose(_server){
    
    _server.close();
    
}

/**
 * @param {string} name - Name service
 * @return {string} string - Text chekMK acept
*/
function serviceTXT(name){
    let dats = _cmk.local[name];

    let status = 0;
    let nstatus = 0;
    let counts = '-';
    let txt  = dats.ok;
    
    if ( Object.keys(dats.counter).length > 0 ){
	counts = '';
	for( let idc in dats.counter ){
	    counts +=idc+'='+dats.counter[idc]+'|';

	    /** test  ok, warning citical */
	    let t =  dats.counter[idc].toString();
	    if ( t.search(';')>=0){
		nstatus = check_multi(dats.counter[idc]);
		if( nstatus > status){
		    status=nstatus;
		}
	    }
	}
	counts = counts.substr(0,counts.length-1);
    }

    if( status == 2) txt=dats.critical;
    if( status == 1) txt=dats.warning;
    
    return status+' '+name+' '+counts+' '+txt+' '+dats.addtxt;

}
/**
 * @param {string} i - value;warn;crit;min;max
 * //@return {int}  status - 0:ok 1:warning 2:critital
*/
function check_multi(i){
    let n = i.split(';');
    /*
      [0] value
      [1] warn
      [2] crit
      [3] min
      [4] max
    */
    //for( let x in n){
	//n[x] = parseInt(n[x]);
    //}
    if( n[2] < n[1] ){
	/* Invert 0 is negative */
	if( n[0] > n[1]){return 0;}	
	if( n[0] > n[2]){return 1;}
	return 2;
    }else{
	/* normal 0 is positive */
	if( n[0] > n[2] ){return 2;}
	if( n[0] > n[1] ){ return 1;}
	return 0;
    }
}
/**
 * Add Service
 * 
 * //@param {string} name - Name of service
 * //@param {json} settings
 * @json {string} name -  Name of service (security)
 * @json {string} ok   - text Info
 * @json {string} warning  - text info over warning
 * @json (string} critical - text info over critical
 * @json {json}  counters  - Json counters
 * @json.counter {string}:{int|string}  - Name counter : value counter
 * metricname=value;warn;crit;min;max
 * count=73;80;90;0;100
*/
function addService(){
    if (!arguments.length) return _cmk.error.E_ADD_ARGUMENTS;
    if ( typeof arguments[1] != 'object' ) return _cmk.error.E_ADD_NOT_JSON +typeof arguments[1];
    
    let name = arguments[0];
    let settings = arguments[1];

    if( settings.name != name ) return _cmk.error.E_ADD_SECURITY;

    settings.counter = settings.counter || {};
    settings.ok = settings.ok || _cmk.error.E_ADD_OK;
    settings.warning = settings.warning || _cmk.error.E_ADD_WAR;
    settings.critical = settings.critical || _cmk.error.E_ADD_CRI;
    settings.addtxt = '';

    _cmk.local[name] = settings;
    if(! _cmk.services.includes(name)){
	_cmk.services.push(name);	
    }


    if (! _cmk.services.includes(name)){
	return 'Error, Unknow';
    }
    return true;
};


/**
 * update Service  
 *
 * @descripton Update counter value
 * //@param {string} name   - Name of service 
 * //@param {json} counters 
 ** @json {string}: {int|string}  - Name counter : value counter
 ** @json {string}: {string}      - Name counter : value counter
 ** @json {string}: {int}         - Name counter : value counter...
 * //@param {string} txt    - text Info added [OK|Warning|CRITICAL]
*/
function updateService(){
    if (!arguments.length) return _cmk.error.E_ADD_ARGUMENTS;
    if ( typeof arguments[1] != 'object') return _cmk.error.E_ADD_NOT_JSON;
    
    let name = arguments[0];
    let settings = arguments[1];
    let newtxt = arguments[2] || ' ';

    if( _cmk.local[name] === undefined) return _cmk.error.E_UPD_SERVICE;

    _cmk.local[name].addtxt = newtxt;//add new text    

    for( let counterName in settings ){
	if(_cmk.local[name].counter[counterName] === undefined) continue;
	let t =  _cmk.local[name].counter[counterName].toString();
	if ( t.search(';')>=0){
	    let n = t.split(';');
	    n[0] = settings[counterName];
	    _cmk.local[name].counter[counterName] = n.join(';');
	}else{
	    _cmk.local[name].counter[counterName] =  settings[counterName];
	}
    }
}

/**
 * Delete Service
 * 
 * //@param {string} name - Name of service

*/
function deleteService(){
    if (!arguments.length) return _cmk.error.E_ADD_ARGUMENTS;
    
    
    let name = arguments[0];
    
    if(_cmk.services.includes(name)){
    delete _cmk.local[name];
	_cmk.services.pop(name);	
    }


    if (! _cmk.services.includes(name)){
	return 'Error, Unknow';
    }
    return true;
};


module.exports = {
    createServer,
    addService,
    deleteService,
    updateService,
    serverClose
}