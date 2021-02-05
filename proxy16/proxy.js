
var _ = require('underscore')
var fs = require('fs');
var path = require('path');


////////////
var f = require('./functions');
var svgCaptcha = require('svg-captcha');
/*
var WSS = require('./wss.js');
const Firebase = require('../proxy/firebase');
*/

var Server = require('./server/https.js');
var WSS = require('./server/wss.js');
var Firebase = require('./server/firebase.js');
var NodeControl = require('./node/control.js');
var NodeManager = require('./node/manager.js');
var Pocketnet = require('./pocketnet.js');
var Wallet = require('./wallet/wallet.js');
var Remote = require('./remote.js');
//////////////


var Proxy = function (settings, manage) {

    var self = this;

    var server = new Server(settings.server, settings.admins, manage);
    var wss = new WSS(settings.admins, manage);
    var pocketnet = new Pocketnet();
    var nodeControl = new NodeControl(settings.node);
    var nodeManager = new NodeManager(settings.nodes);
    var firebase = new Firebase(settings.firebase);
    var wallet = new Wallet(settings.wallet);
    var remote = new Remote();

    f.mix({ 
        wss, server, pocketnet, nodeControl, 
        remote, firebase, nodeManager, wallet,

        proxy : self
    })


    var stats = [];
    var statcount = 5000;
    var statInterval = null;

    var captchas = {};
    var captchaip = {};

    var addStats = function(){

		var ws = {};

		var data = {
            time : f.now(),
            info : self.kit.info(true)
		}

        stats.push(data)

        //console.log(data)

		var d = stats.length - statcount

		if (d > 100){
			stats = stats.slice(d)
		}
    }
    
    var getStats = function(){
        return stats
    }

    var ini = {
        ssl: function () {

            var sslsettings = settings.server.ssl || {}

            var options = {};

            if(!sslsettings.key || !sslsettings.cert || !sslsettings.passphrase) return {}

            try {
                options = {
                    key: fs.readFileSync(path.resolve(__dirname, sslsettings.key)),
                    cert: fs.readFileSync(path.resolve(__dirname, sslsettings.cert)),
                    passphrase: sslsettings.passphrase
                }
            }
            catch (e) {
                options = {}
            }

            return options;

        }
    }

    self.authorization = {
        
        dummy : function(){
            return true
        },

        signature : function(data){

            if (data.signature){
                var authorized = self.pocketnet.kit.authorization.signature(data.signature)

                if (authorized){

                    data.U = data.signature.address

                    if(_.indexOf(settings.admins, data.U) > -1) data.A = true

                    return true
                }
            }

            return false
        

        }
    }

    self.server = {

        init: function () {

            if (settings.server.enabled) {

                return server.init({
                    ssl : ini.ssl(),
                    port : f.deep(settings, 'server.ports.https')
                });

            }

            return Promise.resolve()

        },

        destroy: function () {
            return server.destroy()
        },

        re : function(){
            return this.destroy().then(r => {
                this.init()
            })
        },

        rews : function(){
            return self.server.re().then(r => {
                return self.wss.re()
            }).then(r => {
                return self.firebase.re()
            })
        },

        info : function(compact){
            return server.info(compact)
        },

        get export(){
            return server.export()
        },

    }

    self.wallet = {

        events : function(){
            wallet.clbks.error.queue.main = function(e, p){
                console.log("ERROR QUEUE", e, p)
            }

            wallet.clbks.error.ini.main = function(e, p){
                console.log("ERROR INI", e, p)
            }
        },

        init: function () {
            return wallet.init()
        },

        destroy: function () {
            return wallet.destroy()
        },

        re : function(){
            return this.destroy().then(r => {
                this.init()
            })
        },

        info : function(){
            return wallet.info()
        }
    }

    self.wss = {
        init: function () {

            if (settings.server.enabled) {

                return wss.init({
                    ssl : ini.ssl(),
                    port : f.deep(settings, 'server.ports.wss')
                })

            }

            return Promise.resolve()
        },

        destroy: function () {
            return wss.destroy()
        },

        re : function(){
            return this.destroy().then(r => {
                this.init()
            })
        },

        info : function(compact){
            return wss.info(compact)
        },

        wssdummy : function(wssdummy){
            wss.wssdummy(wssdummy)
        }
    }

    self.nodeControl = {

        enable : function(v){
            return nodeControl.kit.enable(v)
        },

        init: function () {
            return nodeControl.init()
        },

        destroy: function () {
            return nodeControl.destroy()
        },

        start: function() {
            return nodeControl.kit.start()
        },

        stop: function() {
            return nodeControl.kit.stop()
        },

        canstop : function() {
            return nodeControl.kit.canstop()
        },
        
        detach : function() {
            return nodeControl.kit.detach()
        },

        re : function(){
            return this.destroy().then(r => {
                return this.stop()
            }).then(r => {
                return this.init()
            }).then(r => {
                return this.start()
            })
        },

        get request(){
            return nodeControl.request
        },

        get kit(){
            return nodeControl.kit
        },

        info : function(){
            return nodeControl.info()
        }

    }
    ///
    self.nodeManager = {
        init : function () {
            return nodeManager.init()
        },

        destroy : function () {
            return nodeManager.destroy()
        },

        re : function(){
            return this.destroy().then(r => {
                this.init()
            })
        },
        info : function(compact){
            return nodeManager.info(compact)
        }
    }

    self.firebase = {
        init: function () {
            return firebase.init()
        },

        destroy: function () {
            return firebase.destroy()
        },

        re : function(){
            return this.destroy().then(r => {
                this.init()
            })
        },

        info : function(compact){
            return firebase.info(compact)
        }
    }

    self.kit = {
        stats : function(){
            return getStats()
        },
        info : function(compact){
            return {
                status: status,

                nodeManager: self.nodeManager.info(compact),
                nodeControl: self.nodeControl.info(compact),
                firebase : self.firebase.info(compact),
                server: self.server.info(compact),
                wss : self.wss.info(compact),
                wallet : self.wallet.info(compact),
                remote : remote.info(compact),
                admins : settings.admins,

                captcha : {
                    ip : _.toArray(captchaip).length,
                    all : _.toArray(captchas).length
                }
            }
        },

        init: function () {

            var catchError = function(key){
                return (e) => {

                    /*if (key == 'nodeControl'){
                        
                    }*/

                    return Promise.resolve()
                }
            }

            status = 1

            var promises = _.map(['server', 'wss', 'nodeManager', 'wallet', 'firebase', 'nodeControl'], (i) => {
                return self[i].init().catch(catchError(i)).then(() => {
                    return Promise.resolve()
                })
            })

            return Promise.all(promises).then(r => {

                status = 2

                if(!statInterval)
                    statInterval = setInterval(addStats, 10000)

                return Promise.resolve()
            })


        },

        candestroy : function(){

            var cantstopped = []

            var promises = _.map(['nodeControl'], (i) => {
                return self[i].canstop().catch(e => {

                    cantstopped.push(i)

                    return Promise.resolve()
                })
            })

            return Promise.all(promises).catch(e => { return Promise.resolve(); }).then(r => {
                return Promise.resolve(cantstopped)
            })
        },

        destroy: function () {

            if (statInterval){
                clearInterval(statInterval)
                statInterval = null
            }

            var catchError = function(key){
                return (e) => {
                    return Promise.resolve()
                }
            }

            var promises = _.map(['server', 'wss', 'nodeManager', 'wallet', 'firebase', 'nodeControl'], (i) => {
                return self[i].destroy().catch(catchError(i)).then(() => {
                    return Promise.resolve()
                })
            })

            return Promise.all(promises).then(r => {
                status = 0
                return Promise.resolve()
            }).catch(e => {
                return Promise.resolve()
            })
         
        },

        safedestroy : function(){
            return self.kit.candestroy().then(rs => {

                if (rs.length){
        
                    console.clear()
                    console.log("Do you want to detach: "+rs.join(', ')+"?")
        
                    return Promise.reject('detach')
                }
        
                return Promise.resolve()
        
            })
        },

        detach : function(modules){

            if(!modules) modules = ['nodeControl']

            var promises = _.map(modules, (i) => {
                return self[i].detach().catch(e => {
                    return Promise.resolve()
                })
            })

            return Promise.all(promises).catch(e => { return Promise.resolve(); }).then(r => {
                return Promise.resolve()
            })
        }

    }

    self.apibypath = function(path){
        var result = null


        _.find(self.api, function(pack){
            return _.find(pack, function(object){

                if(object.path == path) {

                    result = object

                    return true
                }

            })
        })

        return result
    }

    self.api = {
        node : {
            rpc : {
                path : "/rpc/*",
                action : function({method, parameters, options}){

                    
    
                    if(!method) {
                        return Promise.reject({
                            error : 'method',
                            code : 400
                        })
                    }
                    
        
                    if(!options) options = {}
                    if(!parameters) parameters = []
        
                    var node = null;
        
                    var cached = server.cache.get(method, parameters)
        
                    if (cached){
                        return Promise.resolve({
                            data : cached,
                            code : 208
                        })
                    }
        
                    /// ????
                    if (options.locally && options.meta){
                        node = nodeManager.temp(options.meta)
                    }
        
                    if (options.node){
                        node = nodeManager.nodesmap[options.node]

                        console.log("SELECTED NODE", node, options.node)
                    }
        
                    if(!node || options.auto) node = nodeManager.selectProbability() //nodeManager.selectbest()
          
                    if(!node) {
                        return Promise.reject({
                            error : "node",
                            code : 502
                        })
                    }
        
                    return node.checkParameters().then(r => {
        
                        return node.rpcs(method, parameters)
        
                    }).then(data => {
        
                        server.cache.set(method, parameters, data, node.height())
        
                        return Promise.resolve({
                            data : data,
                            code : 200,
                            node : node.exportsafe()
                        })
        
                    }).catch(e => {
        
                        return Promise.reject({
                            error : e,
                            code : e.code,
                            node : node.export()
                        })
                    })
                }
            }
        },

        nodeManager : {
            revoke : {
                path : '/nodes/revoke',
                authorization : 'signature',
                action : function({node, A}){
                    return nodeManager.revoke(node, A).then(r => {

                        return Promise.resolve({data : r})

                    })
                }
            },
            update : {
                path : '/nodes/update',
                authorization : 'signature',
                action : function({node, A}){
                    return nodeManager.update(node, A).then(r => {

                        return Promise.resolve({data : r})

                    })
                }
            },

            create : {
                path : '/nodes/update',
                authorization : 'signature',
                action : function({node, A, U}){

                    node.addedby = U

                    return nodeManager.create(node).then(r => {

                        return Promise.resolve({data : r})

                    })
                }
            },

            select : {
                path : '/nodes/select',
                action : function(){

                    var node = nodeManager.selectProbability() || nodeManager.selectbest()


                    if(!node){
                        return Promise.reject('cantselect')
                    }

                    return Promise.resolve({data : {
                        node : node.exportsafe()
                    }})

                }
            },

            get : {
                path : '/nodes/get',
                action : function(){

                    return Promise.resolve({data : {
                        nodes : nodeManager.getnodes()
                    }})

                }
            }
        },

        remote : {
            bitchute : {
                path : '/bitchute',
                action : function({url}){

                    return new Promise((resolve, reject) => {
                        remote.make(url, function(err, data, html, $){
	
                            if(!err){
            
                                data.magnet = $('[title="Magnet Link"]').attr('href')
            
                                if(data.magnet && data.magnet.indexOf("magnet") == 0){
            
                                    var sp = parameters(data.magnet, true);
                                    
                                    data.video = sp;
            
                                    if(data.og){
                                        data.video.title = data.og.titlePage
                                        data.video.preview = data.og.image
                                    }
            
                                }
        
                                else{
        
                                    var src = $('#player source').attr('src')
        
                                    if (src){
                                        data.video = {
                                            as : src
                                        }
        
                                        if(data.og){
                                            data.video.title = data.og.titlePage
                                            data.video.preview = data.og.image
                                        }
                                    }
        
                                }
                                
                                resolve({data})
                            }
                            else
                            {
                                reject(err)
                            }	
            
            
                        })
                    })

                    
                }
            },

            url : {
                path : '/url',
                action : function({url}){
                    return new Promise((resolve, reject) => {
                        remote.make(url, function(err, data, html){
        
                            if(!err){
                                data.html = html
                                resolve({data})
                            }
                            else
                            {
                                reject(err)
                            }	
        
                        })
                    })
                }
            },

            urlPreview : {
                path : '/urlPreview',
                action : function({url}){
                    return new Promise((resolve, reject) => {
                        remote.make(url, function(err, data, html){
        
                            if(!err){
                                data.html = html
                                resolve({data})
                            }
                            else
                            {
                                reject(err)
                            }	
        
                        })
                    })
                }
            }
        },

        common : {
            info : {
                path : '/info',
                action : function(){
                    
                    return Promise.resolve({data : {
                        info : self.kit.info(true)
                    }})

                }
            },
            logs : {
                path : '/logs',
                action : function(){

                    var data = {
                        logs : server.middle.getlogs(),
                        /*ws : wss.info(),
                        iplimiter : iplimiter.info()*/
                    }
                    
                    return Promise.resolve({data})

                }
            },
            stats : {
                path : '/stats',
                action : function(){
                    
                    return Promise.resolve({data : {
                        stats : self.kit.stats()
                    }})

                }
            },
            ping : {
                path : '/ping',
                action : function(){
                    
                    return Promise.resolve({data : {
                        time : f.now()
                    }})

                }
            },

            nodes : {
                path : '/nodes',
                action : function(){
                    
                    return Promise.resolve({data : {
                        stats : nodeManager.info()
                    }})

                }
            }
        },

        firebase : {
            set : {
                authorization : 'signature',
                path : '/firebase/set',
                action : function(data){
                    
                    return self.firebase.kit.addToken(data).then(r => {
                        return Promise.resolve({data : r})
                    })

                }
            },

            revokedevice: {
                path : '/firebase/revokedevice',
                action : function(data){
                    
                    return self.firebase.kit.removeDevice(data).then(r => {
                        return Promise.resolve({data : r})
                    })

                }
            },
        },

        captcha : {
            get : {
                authorization : 'signature',
                path : '/captcha',

                action : function({captcha, ip}){
                    if (captcha && captchas[captcha] && captchas[captcha].done){
                        return Promise.resolve({
                            data : {
                                id : captchas[connect.parameters.captcha].id,
                                done : true,
                                result : captchas[connect.parameters.captcha].text
                            }
                        })
                    }

                    captchaip[ip] || (captchaip[ip] = 0);
                    captchaip[ip]++

                    var captcha = svgCaptcha.create({
                        size : 4,
                        noise : 12,
                        color : false,
                        ignoreChars: '0o1liy',
                        width : 250
                    });
                    
                    captcha.id = f.makeid();
    
                    captchas[captcha.id] = {
                        text : captcha.text.toLocaleLowerCase(),
                        id : captcha.id,
                        done : false,
                        time : f.now()
                    }

                    return Promise.resolve({
                        data : {
                            id : captcha.id,
                            img : captcha.data,
                            result : captcha.text, ///
                            done : false
                        }
                    })
                }
            },

            make : {
                authorization : 'signature',
                path : '/makecaptcha',

                action : function({captcha, ip, text}){
                    var captcha = captchas[captcha];

                    if(!captcha){

                        return Promise.reject('captchanotexist')

                     
                    }

                    if (captcha.done){

                        return Promise.resolve({
                            data : {
                                id : captcha.id,
                                done : true
                            }
                        })

                       
                    }

                    if (captcha.text == text.toLocaleLowerCase()){

                        captcha.done = true

                        delete captchaip[ip]

                        return Promise.resolve({
                            data : {
                                id : captcha.id,
                                done : true
                            }
                        })

                    }

                    captcha.shot || (captcha.shot = 0)
                    captcha.shot++;

                    var currentTime = f.now()

                    if (
                        captcha.shot >= 5 || 

                        f.date.addseconds(captcha.time, 120) < currentTime ||
                        f.date.addseconds(captcha.time, 2) > currentTime
                    ){

                        delete captchas[request.data.captcha];


                        return Promise.reject('captchashots')

                    }

                    return Promise.reject('captchanotequal')

                }
            }
        },

        wallet : {
            freeregistration : {
                path : '/free/registration',
                authorization : 'signature',
                action : function({captcha, key, address, ip}){

                    if (settings.server.captcha){

                        if((!captcha || !captchas[captcha] || !captchas[captcha].done)){

                            return Promise.reject('captcha')
    
                        }

                    }

                    self.wallet.kit.addqueue(key || 'registration', address, ip).then(r => {
                        return Promise.resolve({
                            data : r
                        })
                    })

                }
            }
        },

        manage : {
            all : {
                path : '/manage',
                authorization : 'signature',
                action : function(message){


                    if(!message.U) return Promise.reject({error : 'Unauthorized', code : 401})

                    var kaction = f.deep(manage, message.action)

                    if(!kaction) {
                        return Promise.reject({error : 'unknownAction', code : 502})
                    }

                    return kaction(message.data).then(data => {
                        return Promise.resolve({data})
                    })
                }
            }
        }
     
    }

    self.wallet.events()

    return self

}

module.exports = Proxy

/*
const swaggerDocument = require('./docs/api/v1.json');

app.use('/api/v1/help', swaggerUi.serve, swaggerUi.setup(swaggerDocument));*/

