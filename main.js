/*

Statis für Check MK:
0,1 = OK
2 = Warn
3 = error


*/
 

/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';




// @ts-ignore
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName = require('./package.json').name.split('.').pop();
//const request = require("request");
// @ts-ignore
//const axios = require('axios').default;
// @ts-ignore

const checkmk = require('./lib/checkmk.js');
let option_checkmk = {host: '', port: 0, encoding: 'utf8', exclusive: true};

let send_adapter_status = false;
let send_update_info = false;
let num_update = {};


let adapter;


async function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName});

    adapter = new utils.Adapter(options);
	
    //Liste aller Datenpunkte
    // @ts-ignore
    adapter._checkmkDPs             = {};    

    /*
    adapter.on('message', obj => {
        adapter.log.info("message: " + JSON.stringify(obj));
        //processMessages(obj);
    });
    */
    adapter.on('ready', () => {
        
        option_checkmk.host = adapter.config.ip;
        option_checkmk.port = adapter.config.port;
        
        send_adapter_status = adapter.config.Adapter_Status;
        send_update_info = adapter.config.Updates;


        new checkmk.createServer(option_checkmk);
        if(send_adapter_status){
            adapter.log.info("Adapter Status Log Activ");
            load_adapters();
        }
        if(send_update_info){
            adapter.log.info("Adapter Update Activ");
            load_update();
        }
        load_objekte();
        
        
    });

    adapter.on('unload', (callback) => {
        try {
                          
                
            callback();
        } catch (e) {
            callback();
        }

        
    });

    
    
    
    // is called if a subscribed state changes
    adapter.on('stateChange', (id, state) => {
        //nur wenn ack true ist.
        if(state && state.ack){
        //prüfen ob das ein adapter ist:
            if(id.substr(0,14) == "system.adapter" && send_adapter_status){
                //adapter.log.info("Adapter change");
                update_adapter_checkmk(id,state);
            }else if(id == "admin.0.info.updatesNumber" && send_update_info){

                update_info_update_checkmk(id,state);

            }else{
                //adapter.log.info("state change");
                update_states_checkmk(id,state);
            }
        }
    });  
    

    //is callend if a subscribed object changes
    adapter.on('objectChange', (id, obj) => {
        if (obj && obj.common &&
            (obj.common.custom && obj.common.custom[adapter.namespace] && typeof obj.common.custom[adapter.namespace] === 'object' && obj.common.custom[adapter.namespace].enabled)
        ) {
        
        adapter.log.info('enable checkmk logging of ' + id);
        
        add_checkmk(id,obj);

        adapter.log.debug("Überwachte Datenpunkte: " + JSON.stringify(adapter._checkmkDPs));
        

        }else{
            
            if (adapter._checkmkDPs[id]) {
                
                delete_checkmk(id, obj);
                adapter.log.info('disabled logging of ' + id);
                adapter.log.debug("Überwachte Datenpunkte: " + JSON.stringify(adapter._checkmkDPs));
            }
        }
     }); 
    
     
    return adapter;
}

//Lädt die Adapter Informationen und erstellt die Services beim Adapterstart
async function load_adapters(){
    //adapter.subscribeForeignStates('system.adapter.*.*.connected');
    //system.adapter.admin.0.connected
    var test 
    var name

     let states = await adapter.getForeignStatesAsync('system.adapter.*.*.connected').catch((e) => adapter.log.warn(e));;
     test = states;
     if(states){
     for (var id in states) {
         if(states[id] && states[id].val && states[id].val !== null){
            //adapter.log.info(id + ' = ' + states[id].val);
          // namen der ID anpassen, sodass nur noch name Adapter.? raus kommt:
           var end_pos = id.length;
           end_pos = end_pos -25;
           var new_id = id.substr(15, end_pos);
           //adapter.log.warn(JSON.stringify(new_id));
           //check mk Service für jeden Adapter anlegen
           checkmk.addService(new_id,{ name: new_id, ok: 'Adapter is OK', warning: 'Adapter on Warning', critical: 'Adapter on error', counter: { status : '0;1;2' }});
           //jede id subcriben damit die änderungen an check mk übertragen werden können.
           update_adapter_checkmk(id, states[id]);
           adapter.subscribeForeignStates(id);
           // und jetzt noch den aktuellen Status des udupates übergeben:
         }
         }

          adapter.log.debug(JSON.stringify(test));
     }
             
}           

// Läadt die Objekt Informationen und erstellt die Services beim Adapterstart
async function load_objekte(){
    adapter.log.debug("load objekte");
    //bestehende States suchen und änderungen abbonieren:

    let obj = await adapter.getForeignObjectsAsync('*');
    
     if(obj != null){
     for (var id in obj) {
        //Ist beim Objekt der Hacken gesetzt.
        //adapter.log.debug(JSON.stringify(id));

        
        if (obj[id] && obj[id].common &&
            (obj[id].common.custom && obj[id].common.custom[adapter.namespace] && typeof obj[id].common.custom[adapter.namespace] === 'object' && obj[id].common.custom[adapter.namespace].enabled)
        ) 
        {
           add_checkmk(id,obj[id]);
        }
     }
    }

    //Updates fürs alles Objekte bekommen
    adapter.subscribeForeignObjects('*');

    
}

//Lädt die Update Informationen zu check mk
async function load_update(){
       adapter.log.debug("load update info");
    
    num_update = await adapter.getForeignStateAsync('admin.0.info.updatesNumber').catch((e) => adapter.log.warn(e));;
    adapter.log.debug("update: " + num_update.val);
    //if (num_update && num_update.val && num_update.val !== null) {
    
    
        checkmk.addService('Adapter_Update_Status',{ name: 'Adapter_Update_Status', ok: 'No Updates available', warning: 'some updates ar available', critical: 'many updates are available', counter: { updates : num_update.val+';1;10' }});
        checkmk.addService('Adapter_Updates',{ name: 'Adapter_Updates', ok: 'No Updates available', warning: ' ', critical: ' ', counter: { updates : num_update.val+';5;10' }});
    
    
        

    adapter.subscribeForeignStates('admin.0.info.updatesNumber');
    
    //update_info_update_checkmk('id','state');
}

// added ein State zu checkmk
async function add_checkmk(id, obj){

    var end_pos = id.length;
    end_pos = end_pos -25;
    var new_id = id.substr(15, end_pos);

    adapter.log.debug(JSON.stringify(id));
    //state holen:
    var state = await adapter.getForeignStateAsync(id).catch((e) => adapter.log.warn(e));;
    //adapter.log.warn(JSON.stringify(state));
     //wenn boolean
     if(obj.common.type === "boolean"){

         adapter.log.debug("ist boolean");
         //variante prüfen
         if(obj.common.custom[adapter.namespace].bool_wert_ok){
             checkmk.addService(id,{ name: id,
                 ok: obj.common.custom[adapter.namespace].Status_OK,
                 warning: obj.common.custom[adapter.namespace].Status_Warning,
                 critical: obj.common.custom[adapter.namespace].Status_critical,
                 counter: { status : '0;1;1' }});
             update_states_checkmk(id, state);
             adapter.subscribeForeignStates(id);

             adapter._checkmkDPs[id] = obj.common.custom[adapter.namespace];
             adapter._checkmkDPs[id].id = id;
             
         }else{
             checkmk.addService(id,{ name: id,
                 ok: obj.common.custom[adapter.namespace].Status_OK,
                 warning: obj.common.custom[adapter.namespace].Status_Warning,
                 critical: obj.common.custom[adapter.namespace].Status_critical,
                 counter: { status : '1;0;0' }});
             update_states_checkmk(id, state);
             adapter.subscribeForeignStates(id);

             adapter._checkmkDPs[id] = obj.common.custom[adapter.namespace];
             adapter._checkmkDPs[id].id = id;
             
         }

     }
     //wenn number
     else if(obj.common.type === "number"){

         adapter.log.debug("ist number");
         checkmk.addService(id,{ name: id,
             ok: obj.common.custom[adapter.namespace].Status_OK,
             warning: obj.common.custom[adapter.namespace].Status_Warning,
             critical: obj.common.custom[adapter.namespace].Status_critical,
             counter: { status : '0;'+obj.common.custom[adapter.namespace].num_wert_warning+';'+obj.common.custom[adapter.namespace].num_wert_critikal+'' }});
         update_states_checkmk(id, state);
         adapter.subscribeForeignStates(id);

         adapter._checkmkDPs[id] = obj.common.custom[adapter.namespace];
         adapter._checkmkDPs[id].id = id;
         

     }
     //wenn string
     else if(obj.common.type === "string"){

         adapter.log.debug("ist string");
         checkmk.addService(id,{ name: id,
             ok: obj.common.custom[adapter.namespace].Status_OK,
             warning: obj.common.custom[adapter.namespace].Status_Warning,
             critical: obj.common.custom[adapter.namespace].Status_critical,
             counter: { status : '0;1;2' }});
         update_states_checkmk(id, state);
         adapter.subscribeForeignStates(id);

         adapter._checkmkDPs[id] = obj.common.custom[adapter.namespace];
         adapter._checkmkDPs[id].id = id;
         

     }
     //wenn nichts
     else{
         adapter.log.warn("This id: " + id + " Type of " + obj.common.type + " is not supported!");
     }


    //checkmk.addService(new_id,{ name: new_id, ok: 'Adapter is OK', warning: 'Adapter on Warning', critical: 'Adapter on error', counter: { status : '0;1;2;0;3' }});
    //update_states_checkmk(id, obj[id]);
    //adapter.subscribeForeignStates(id);


}

// löscht ein State bei checkmk
async function delete_checkmk(id,obj){

    checkmk.deleteService(id);
    delete adapter._checkmkDPs[id];

}


//Update Status der Adapter
async function update_adapter_checkmk(id, state){

 // namen der ID anpassen, sodass nur noch name Adapter.? raus kommt:
 var pos = id.lastIndexOf('.');
 pos = pos +1;
 var end_pos = id.length;
 end_pos = end_pos -25;
 var new_id = id.substr(15, end_pos);
 var teil_id = id.substr(0, pos);
 var alive_id = teil_id + "alive";
 
 //adapter.log.warn("Datenpuntk: " + id + " hat den wert: " + state.val);


     //wenn connectet true adapter geht es gut

     if(state.val == true){
         //adapter.log.info("staus 0");
         checkmk.updateService(new_id, {status: 0});
     }
     //wenn connect false
     if(state.val == false){
         //prüfen ob alive true ist:
         adapter.getForeignStateAsync(alive_id, function (err, states) {

             //Alive ist true, aber connection nicht da --> Error
             if(states.val == true){
               // adapter.log.info("staus 2");
                 checkmk.updateService(new_id, {status: 2});

             }
             //Adapter ist aus
             if(states.val == false){
                //adapter.log.info("staus 1");
                 checkmk.updateService(new_id, {status: 1});
             }


         });
         
         
     }
     
     
     //adapter.log.info(id);
     //adapter.log.info(JSON.stringify(state));


     //main();



}

//Update Status der States die überwacht werden.
async function update_states_checkmk(id, state){

    var pos = id.lastIndexOf('.');
    pos = pos +1;
    var end_pos = id.length;
    end_pos = end_pos -25;
    var new_id = id.substr(15, end_pos);
    var teil_id = id.substr(0, pos);
    var alive_id = teil_id + "alive";

    var obj = await adapter.getForeignObjectAsync(id);
    var typ = obj.common.type;
    var name = id;
    var einstellung_bool = obj.common.custom[adapter.namespace].bool_wert_ok;
    var einstellung_num_inverse = obj.common.custom[adapter.namespace].num_wert_inverse;
    var einstellung_num_warn = obj.common.custom[adapter.namespace].num_wert_warning;
    var einstellung_num_crit = obj.common.custom[adapter.namespace].num_wert_critikal;
    var einstellung_string_ok = obj.common.custom[adapter.namespace].str_wert_ok;
    var einstellung_string_warn = obj.common.custom[adapter.namespace].str_wert_warning;
    var einstellung_string_crit = obj.common.custom[adapter.namespace].str_wert_critikal;

    adapter.log.debug("name: " + name);
    adapter.log.debug("statve value: " + state.val);

    if(typ == "boolean" && einstellung_bool){
        if(state.val == true){
            adapter.log.debug("status 0");
            checkmk.updateService(name, {status: 0});
        }else{
            adapter.log.debug("status 1");
            checkmk.updateService(name, {status: 1});
        }
    }
    if(typ == "boolean" && !einstellung_bool){
        if(state.val == true){
            adapter.log.debug("status 1");
            checkmk.updateService(name, {status: 1});
        }else{
            adapter.log.debug("status 0");
            checkmk.updateService(name, {status: 0});
        }
    }

    if(typ == "number" && !einstellung_num_inverse){
        if(state.val < einstellung_num_warn){
            adapter.log.debug("status ok");
            checkmk.updateService(name, {status: 0});
        }else if(state.val >= einstellung_num_warn && state.val < einstellung_num_crit)
        {
            adapter.log.debug("status warn");
            checkmk.updateService(name, {status: 1});
        }else{
            adapter.log.debug("status crit");
            checkmk.updateService(name, {status: 2});
        }
    }

    if(typ == "number" && einstellung_num_inverse){
        if(state.val >= einstellung_num_warn){
            adapter.log.debug("status ok");
            checkmk.updateService(name, {status: 0});
        }else if(state.val < einstellung_num_warn && state.val > einstellung_num_crit)
        {
            adapter.log.debug("status warn");
            checkmk.updateService(name, {status: 1});
        }else{
            adapter.log.debug("status crit");
            checkmk.updateService(name, {status: 2});
        }
    }

    if(typ == "string"){
        if(state.val == einstellung_string_ok){
            adapter.log.debug("status ok");
            checkmk.updateService(name, {status: 0});
        }else if(state.val == einstellung_string_warn)
        {
            adapter.log.debug("status warn");
            checkmk.updateService(name, {status: 1});
        }else if(state.val == einstellung_string_crit)
        {
            adapter.log.debug("status crit");
            checkmk.updateService(name, {status: 2});
        }else{
            adapter.log.debug("status unknow");
            checkmk.updateService(name, {status: -1}, "status unknow");
        }
    }

}

// schreibe neue Updateinformationen 
async function update_info_update_checkmk(id,state){
    adapter.log.debug("load update info udpate");
    let egal_update_neu = await adapter.getForeignStateAsync('admin.0.info.updatesNumber').catch((e) => adapter.log.warn(e));;
    let num_update_neu = egal_update_neu.val;
    //adapter.log.debug("update: " + num_update_neu);
    if(num_update != num_update_neu && num_update_neu > 0){
        let update_list = await adapter.getForeignStateAsync('admin.0.info.updatesList').catch((e) => adapter.log.warn(e));;
        checkmk.updateService('Adapter_Update_Status', {updates: num_update_neu}, 'Updates: '+ num_update_neu);
        checkmk.updateService('Adapter_Updates', {updates: num_update_neu},update_list.val);
    }
    if(num_update != num_update_neu && num_update_neu == 0){

        checkmk.updateService('Adapter_Update_Status', {updates: 0});
        checkmk.updateService('Adapter_Updates', {updates: 0});

    }
    
}



// If started as allInOne/compact mode => return function to create instance

// @ts-ignore
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
