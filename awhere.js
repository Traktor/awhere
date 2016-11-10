'use strict';

//
// Node.js modules sand 3rd party libs.
//
var lib = {
    http:        require('http'),
    https:       require('https'),
    querystring: require('querystring')
};



//
// Time constants
//
var SECOND = 1000;
var MINUTE = 60 * SECOND;
var HOUR   = 60 * MINUTE;
var DAY    = 24 * HOUR;



//
// Handy constants and vars.
//
var POST_MAX_SIZE  = 20 * 1000 * 1000; // 20MB in bytes.
var ACRES_IN_HECTARE = 2.47105;
var aWhereToken = null;
var aWhereTokenExpiresAt = null;
var aWhereTokenRequestMaxRetries = 5;
var aWhereTokenRequestRetries = 0;
var aWhereFieldIdNamespace = 'awherejs_field_';
var aWhereFieldsMap = {};
var aWhereFieldsFetched = false;



//
// Public API
//
var aWhere = {};

aWhere.key = null;
aWhere.secret = null;



//
// Fields
//

aWhere.getFields = function () {
    var params, callback;

    if (arguments.length === 1) {
        params   = {};
        callback = arguments[0];
    } else {
        params   = arguments[0];
        callback = arguments[1];
    }

    aWhereRequest({
        path: '/v2/fields'
    }, params, wrapCallback(callback));
};

aWhere.getField = function (params, callback) {
    aWhereRequest({
        path: '/v2/fields/' + params.id
    }, params, wrapCallback(callback));
};

aWhere.createField = function (params, callback) {
    params.id = params.id || aWhereFieldIdNamespace + uniqueId();

    var aWhereParams = {
        id: params.id,
        farmId: params.farmId || params.farm_id || params.id,
        name: params.name || 'Untitled field',
        acres: 1,
        centerPoint: params.centerPoint || params.center_point || {
            latitude: params.lat || 0,
            longitude: params.lng || 0,
        }
    };

    aWhereRequest({
        method: 'POST',
        path: '/v2/fields'
    }, aWhereParams, function (err, response) {
        if (err) {
            err.paramsSent = aWhereParams;
        }
        wrapCallback(callback)(err, response);
    });
};

aWhere.updateField = function (pathParams, params, callback) {
    aWhereRequest({
        method: 'PATCH',
        path: '/v2/fields/' + pathParams.id
    }, params, wrapCallback(callback));
};

aWhere.deleteField = function (params, callback) {
    aWhereRequest({
        method: 'DELETE',
        path: '/v2/fields/' + params.id
    }, {}, wrapCallback(callback));
};



//
// Plantings
//

aWhere.getPlantings = function (params, callback) {
    if (arguments.length === 1) {
        callback = params;
        params = {};
    }

    var fieldId = params.fieldId || params.field_id;
    var plantingId = params.plantingId || params.planting_id;
    var path = '/v2/agronomics';

    if (fieldId) {
        path += '/fields/' + fieldId;
    }

    path += '/plantings';

    if (plantingId) {
        path += '/' + plantingId;
    }

    if (params.current) {
        path += '/current';
    }

    aWhereRequest({
        path: path
    }, params, wrapCallback(callback));
};

aWhere.getOrCreatePlanting = function (params, callback) {
    aWhere.getPlantings({ 
        fieldId: params.fieldId, 
        current: true 
    }, function (err, response) {
        if (isFunction(callback)) {
            if (err && err.code !== 404) {
                callback(err, response);
            } else if (response.id) {
                callback(null, response);
            } else {
                aWhere.createPlanting(params, callback);
            }
        }
    });
};

aWhere.createPlanting = function (params, callback) {
    aWhereRequest({
        method: 'POST',
        path: '/v2/agronomics/fields/' + params.fieldId + '/plantings'
    }, params, wrapCallback(callback));
};

aWhere.updatePlanting = function (pathParams, params, callback) {
    // Update API doesn't work.
    // So for now we delete and create instead.

    // aWhereRequest({
    //     method: Array.isArray(params) ? 'PATCH' : 'PUT',
    //     path: '/v2/agronomics/fields/' + pathParams.fieldId + '/plantings/' + (pathParams.plantingId || 'current')
    // }, params, wrapCallback(callback));

    aWhere.deletePlanting(pathParams, function (err, response) {
        if (err) {
            if (isFunction(callback)) {
                callback(err, response);
            }
        } else {
            aWhere.createPlanting(merge(pathParams, params), callback);
        }
    });
};

aWhere.deletePlanting = function (params, callback) {
    aWhereRequest({
        method: 'DELETE',
        path: '/v2/agronomics/fields/' + params.fieldId + '/plantings/' + (params.plantingId || 'current')
    }, {}, wrapCallback(callback));
};



//
// Weather
//

aWhere.getCurrentConditions = function (params, callback) {
    function req(fieldId) {
        aWhereRequest({
            path: '/v2/weather/fields/' + fieldId + '/currentconditions'
        }, params, wrapCallback(callback));
    }
    if (params.lat && params.lng) {
        delete params.fieldId;
        getFieldByLatLng(params.lat, params.lng, function (err, field) {
            if (err) { return callback(err); }
            req(field.id);
        });
    } else if (params.fieldId) {
        delete params.lat;
        delete params.lng;
        req(params.fieldId);
    }
};

aWhere.getForecasts = function (params, callback) {
    function req(fieldId) {
        var path = '/v2/weather/fields/' + fieldId + '/forecasts';
        var date = '';

        if (params.date) {
            date = aWhere.formatDate(params.date);
            path += '/' + date + ',' + date;
        }

        aWhereRequest({
            path: path
        }, params, wrapCallback(callback));
    }

    if (params.lat && params.lng) {
        delete params.fieldId;
        getFieldByLatLng(params.lat, params.lng, function (err, field) {
            if (err) { return callback(err); }
            req(field.id);
        });
    } else if (params.fieldId) {
        delete params.lat;
        delete params.lng;
        req(params.fieldId);
    }
};

aWhere.getObservations = function (params, callback) {
    function req(fieldId) {
        var path = '/v2/weather/fields/' + fieldId + '/observations';
    
        if (params.startDate && params.endDate) {
            path += '/' + params.startDate + ',' + params.endDate;
        }

        params.limit = params.limit || 120;

        aWhereRequest({
            path: path
        }, params, wrapCallback(callback));
    }

    if (params.lat && params.lng) {
        delete params.fieldId;
        getFieldByLatLng(params.lat, params.lng, function (err, field) {
            if (err) { return callback(err); }
            req(field.id);
        });
    } else if (params.fieldId) {
        delete params.lat;
        delete params.lng;
        req(params.fieldId);
    }
};



//
// Crops and Models
//
var aWhereCrops;
// var aWhereModels;

aWhere.getCrops = function (params, callback) {
    params.limit = params.limit || 120;

    if (aWhereCrops) {
        callback(null, aWhereCrops);
    } else {
        aWhereRequest({
            path: '/v2/agronomics/crops'
        }, params, function (err, response) {
            if (err) { return callback(err, response); }

            if (params.defaultsOnly) {
                response.crops = response.crops.filter(function (crop) {
                    return crop.isDefaultForCrop;
                });
            }

            aWhereCrops = response;
            callback(null, response);
        });
    }
};

aWhere.getModels = function (params, callback) {
    params.limit = params.limit || 120;

    aWhereRequest({
        path: '/v2/agronomics/models'
    }, params, function (err, response) {
        if (err) { return callback(err, response); }
        callback(null, response);
    });
};



//
// Agro Values
//

aWhere.getAgronomicValues = function (params, callback) {
    aWhereRequest({
        path: '/v2/agronomics/fields/' + params.fieldId + '/agronomicvalues'
    }, params, wrapCallback(callback));
};

aWhere.getModelResults = function (params, callback) {
    aWhereRequest({
        path: '/v2/agronomics/fields/' + params.fieldId + '/models/' + params.modelId + '/results'
    }, params, wrapCallback(callback));
};



//
// Misc.
//
aWhere.formatDate = function (date, options) {
    date = date || new Date();

    if (typeof date === 'string') {
        date = new Date(date);
    }

    var year   = date.getFullYear();
    var month  = padZero(date.getMonth() + 1);
    var day    = padZero(date.getDate());
    var hour   = padZero(date.getHours());
    var minute = padZero(date.getMinutes());
    var time   = '';

    if (options && options.includeTime) {
        time = ' ' + hour + ':' + minute;
    }

    return year + '-' + month + '-' + day + time;
};



module.exports = aWhere;










//
//
// H E L P E R   F U N C T I O N S
//
//


function aWhereApiToken(callback) {
    var date = new Date();

    function retry() {
        aWhereTokenRequestRetries += 1;

        if (aWhereTokenRequestRetries <= aWhereTokenRequestMaxRetries) {
            aWhereApiToken(callback);
        } else {
            aWhereTokenRequestRetries = 0;
            callback({ message: 'Can not get aWhere token' });
        }
    }

    if (date.getTime() > aWhereTokenExpiresAt) {
        request({
            method: 'POST',
            hostname: 'api.awhere.com',
            path: '/oauth/token',
            username: aWhere.key,
            password: aWhere.secret,
            https: true
        }, { 
            'grant_type': 'client_credentials' 
        }, function (err, response) {
            if (err || !response.body) { return retry(); }
            response.body = JSON.parse(response.body);

            if (response.body.access_token && response.body.expires_in) {
                var expiresIn = parseFloat(response.body.expires_in) * SECOND;

                aWhereToken = response.body.access_token;
                aWhereTokenExpiresAt = date.getTime() + expiresIn;

                callback(null, aWhereToken);
            } else {
                retry();
            }
        });
    } else {
        callback(null, aWhereToken);
    }
}


function aWhereSuccessCode(code) {
    return code === 200 || code === 201 || code === 204;
}


function aWhereRequest(options, params, callback) {
    aWhereApiToken(function (err, token) {
        if (err) { 
            return wrapCallback(callback)(err); 
        }

        options = merge({
            hostname: 'api.awhere.com',
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            https: true
        }, options);

        request(options, params, function (err, response) {
            if (err) {
                return wrapCallback(callback)(err, response);
            }

            try {
                response.body = JSON.parse(response.body);

                if (aWhereSuccessCode(response.status.code)) {
                    callback(null, response.body);
                } else {
                    callback(response.body, null);
                }
            } catch (e) {
                callback(e, response);
            }
        });
    });
}


function aWhereBatchRequests(requests, callback) {
    /* Uselss! Their batch job implementation is VERY SLOW!!! */
    function getJobResults(jobId) {
        aWhereRequest({
            path: '/v2/jobs/' + jobId
        }, {}, function (err, response) {
            if (response && Array.isArray(response.results)) {
                callback(null, response.results);
            } else if (response.jobStatus !== 'cancelled' && response.jobStatus !== 'purged' ) {
                setTimeout(function () { getJobResults(jobId) }, SECOND);
            } else {
                callback(err || response, response);
            }
        });
    }
    aWhereRequest({
        method: 'POST',
        path: '/v2/jobs'
    }, {
        type: 'batch', 
        requests: requests.map(function (r, i) {
            return {
                title: i,
                api: 'GET ' + r.path + (isObject(r.params) ? '?' + lib.querystring.stringify(r.params) : '')
            };
        })
    }, function (err, response) {
        if (response.body && response.body.jobId) {
            getJobResults(response.body.jobId);
        } else {
            callback(err || response, response);
        }
    });
}


function getFieldByLatLng(lat, lng, callback) {
    if (!isFunction(callback) || !lat || !lng) { return; }

    function appendFieldToFieldMap(field) {
        var key = field.centerPoint.latitude + ',' + field.centerPoint.longitude;
        aWhereFieldsMap[key] = field;
    }

    function getOrCreateField() {
        var key = lat + ',' + lng;

        if (aWhereFieldsMap[key]) {
            callback(null, aWhereFieldsMap[key]);
        } else {
            aWhere.createField({ lat: lat, lng: lng }, function (err, field) {
                if (!err && field) {
                    appendFieldToFieldMap(field);
                }
                callback(err, field);
            });
        }
    }

    if (!aWhereFieldsFetched) {
        aWhere.getFields(function (err, response) {
            if (err || !response.fields) { 
                callback(err); 
            } else {
                response.fields.forEach(appendFieldToFieldMap);
                aWhereFieldsFetched = true;
                getOrCreateField();
            }
        });
    } else {
        getOrCreateField();
    }
}


function wrapCallback(callback) {
    return function (err, response) {
        if (isFunction(callback)) {
            if (err) { 
                callback(err, response); 
            } else {
                callback(null, response);
            }
        }
    };
}


//
// Handy wrapper for Node's http.request
// https://nodejs.org/api/http.html#http_http_request_options_callback
//
//    request({
//        method: 'GET',
//        host: 'apple.com',
//        path: '/ipad'
//    }, function (body) {
//        console.log(body); 
//    });
//
function request(options, params, callback) {
    var isHTTPS = options.https || options.protocol === 'https:';

    if (options.username && options.password) {
        options.auth = options.username + ':' + options.password;
    }

    options = {
        method: options.method || 'GET',
        hostname: options.host || options.hostname,
        port: options.port,
        path: options.path,
        headers: options.headers || {},
        auth: options.auth,
        agent: options.agent
    };

    if (params && typeof params === 'object') {
        if (/GET|HEAD/.test(options.method)) {
            var prefix = (options.path.indexOf('?') !== -1) ? '&' : '?';
            options.path += prefix + lib.querystring.stringify(params);
        } else if (/POST|PUT|PATCH|DELETE/.test(options.method)) {
            if (!options.headers['Content-Type']) {
                params = lib.querystring.stringify(params);
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else if (options.headers['Content-Type'] === 'application/json') {
                params = JSON.stringify(params);
            }
            if (typeof params === 'string') {
                options.headers['Content-Length'] = params.length;
            }
        }
    }

    var client = isHTTPS ? lib.https : lib.http;
    var req = client.request(options, function (res) {
        parseSocketBody(res, function (err, body) {
            callback(err, {
                status: { 
                    code: res.statusCode, 
                    message: res.statusMessage 
                }, 
                headers: res.headers, 
                body: body 
            });
        });
    });

    req.on('err', function (err) {
        callback(err, { status: {}, headers: {}, body: '' });
    })

    if (/POST|PUT|PATCH|DELETE/.test(options.method) && typeof params === 'string') {
        req.write(params);
    }

    req.end();
}


//
// Generic request/response socket body parser.
//
function parseSocketBody(socket, callback, options) {
    options = options || {};

    var sizeLimit = options.sizeLimit || POST_MAX_SIZE;
    var body = '';

    socket.on('data', function (chunk) {
        body += chunk;

        if (body.length > sizeLimit) {
            callback({ message: 'Socket size limit reached.' });
        }
    });

    socket.on('error', function (err) {
        callback(err, body);
    });

    socket.on('end', function () {
        callback(null, body);
    });
}


//
// Extend an object recursively with properties from other objects.
//
function extend(target) {
    var i, obj, prop, objects = Array.prototype.slice.call(arguments, 1);

    target = target || {};

    for (i = 0; i < objects.length; i += 1) {
        obj = objects[i];
        
        if (obj) for (prop in obj) if (obj.hasOwnProperty(prop)) {
            if (Object.prototype.toString.call(obj[prop]) === '[object Object]') {
                target[prop] = target[prop] || {};
                extend(target[prop], obj[prop]);
            } else {
                target[prop] = obj[prop];
            }
        }
    }

    return target;
}


//
// Merge any number of objects into a new object.
//
function merge() {
    var objects = Array.prototype.slice.call(arguments);
    return extend.apply(null, [{}].concat(objects));
}


//
// Prepend zero to a number if it's less then tan.
// Used for Date objects.
//
function padZero(num) {
    return num < 10 ? '0' + num : num;
}


//
// Pseudo unique id generator.
//
function uniqueId() {
    return Math.round(Math.random() * Date.now()).toString(36);
}


//
// Check if variable is a valid object.
//
function isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
}


//
// Check if variable is a valid function.
//
function isFunction(obj) {
    return typeof obj === 'function';
}