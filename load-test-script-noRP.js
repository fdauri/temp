import http from "k6/http";
import { group, check, sleep} from "k6";
import { Counter } from "k6/metrics";

var data = open("./anagrafica.csv").split(/\r?\n/);
var eventCounter = new Counter("eventCounter");
var eventCounterKO = new Counter("eventCounterFailed");

/*
export let options = {
    stages: [
        { duration: "5s", target: 50 },
        { duration: "10s", target: 100  },
        { duration: "20s", target: 500 },
        { duration: "7m", target: 25000 }
    ]
}
*/

/*
{
    vus: 1000,
    duration: "15s"
};
*/

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Il max è escluso e il min è incluso
}

function generateUniqueRandomID() {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    var uniqueRandomID =  Math.random().toString(36).substr(2, 9);
    return uniqueRandomID;
  };

  function generateUUID() {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
  }

export default function () {
    //var index = __ITER % data.length;  //Follow the array result of the split method taking every item of the array for each VU (vus)
    var index = getRandomInt(0, data.length);
    var row = data[index];
    var items = row.split('|');
    //console.log(`VU ${__VU} on iteration ${__ITER} is loading the person: ${items[1]} ${items[0]}, CF: ${items[4]}`);
    var url= `${__ENV.WP_ENDPOINT}`;
    //console.log(`ENDPOINT: ${url}`);
    var params = new Object;
    params.requestNumber = generateUUID();    
    params.name = items[1];
    params.surname = items[0];
    params.gender = items[2];
    params.fiscalCode = items[4];
    var birthDateArray = items[3].split('/');
    params.birthDate = birthDateArray[2].concat('-',birthDateArray[1],'-',birthDateArray[0]);
    params.region = items[6];
    params.district = items[7];
    params.city = items[5];
    params.zipCode = items[8];
    params.familyMembers = getRandomInt(0,6);
    params.isee = getRandomInt(12000,120000);
    var currentDateUTC = new Date();
    params.creationTimeStamp = currentDateUTC.toJSON();

    //creating http request payload
    var payload = JSON.stringify(params);
    var paramsOption =  { headers: { "Content-Type": "application/json" } }
    //console.log(`VU ${__VU} on iteration ${__ITER} is sendind data: ${payload}`);


    //Write Path
    let res = http.post(url, payload, paramsOption);
    console.log(`HTTP Response for VU ${__VU} on iteration ${__ITER}: status ${res.status} with RT ${res.timings.duration}`);
    check(res, {
        "status was 200": (r) => r.status == 200,
        "transaction time OK": (r) => r.timings.duration < 300
    });
    if(res.status != 200) {
        console.log("Error! Http status: " + res.status);
        eventCounterKO.add(1);
    }
    else {
        eventCounter.add(1);
    }
    
};

/*
Json format:
{
    "requestNumber": "string",
    "name": "string",
    "surname": "string",
    "gender": "string",
    "fiscalCode": "string",
    "birthDate": "2020-01-07T14:03:25.562Z",
    "region": "string",
    "district": "string",
    "city": "string",
    "zipCode": "string",
    "familyMembers": 0,
    "isee": 0,
    "creationTimeStamp": "2020-01-07T14:03:25.562Z",
    "isValidated": true,
    "isValid": true,
    "invalidReason": "string"
  }
  */