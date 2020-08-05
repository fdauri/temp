import http from "k6/http";
import { group, check, sleep} from "k6";
import { Counter, Trend } from "k6/metrics";

var data = open("./anagrafica.csv").split(/\r?\n/);
var eventCounterTotal = new Counter("Custom-WP-Total-Counter");
var eventCounterOK = new Counter("Custom-WP-OK-Counter");
var eventCounterKO = new Counter("Custom-WP-KO-Counter");
var readPathOKCounter = new Counter("Custom-RP-OK-Counter");
var readPathKOCounter = new Counter("Custom-RP-KO-Counter");
var readPath404Counter = new Counter("Custom-RP-404-Counter");
var readPathTotalCounter = new Counter("Custom-RP-Total-Counter");
var resultOutOfAvgCounter = new Counter("Custom-RP-ReadGreaterThan0.5-Counter");
var writePathTrend = new Trend("Write Path Trend");
var readPathTrend = new Trend("Read Path Trend");
var roundtripTime  = new Trend("Event Roundtrip time");

var paramsOption =  { headers: { "Content-Type": "application/json" } }
var urlWrite= `${__ENV.WP_ENDPOINT}`;
var urlRead = `${__ENV.RP_ENDPOINT}`;
var readRetryParams = `${__ENV.RP_RETRYPARAM}`;
var params = new Object;

var debugLog = true;

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Il max è escluso e il min è incluso
}

function generateUniqueRandomID() {
    var diff = 16-(id.length);
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

function DateDiff(date1, date2) {
    return date1.getTime() - date2.getTime();
}

function WritePath(){
    
    var writePathTime = null;
    var localRequestNumber = null;

    var index = getRandomInt(0, data.length);
    var row = data[index];
    var items = row.split('|');

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

    //Write Path
    group("Write Path", function() {
        let res = http.post(urlWrite, payload, paramsOption);
        eventCounterTotal.add(1);
        writePathTrend.add(res.timings.duration);
        check(res, {
            "status was 200": (r) => r.status == 200
        });
        if(res.status != 200) {
            console.log("WritePath: Error! Http status: " + res.status);
            eventCounterKO.add(1);
        }
        else {
            localRequestNumber = JSON.parse(res.body);
            eventCounterOK.add(1);
            writePathTime = new Date();
        }
    })
    return [ writePathTime, localRequestNumber ];
}

function ReadPath( requestNumber, maxIteration, firstdelay ){
    
    var ackReceived = false;
    var readPathTime = null;

    if (debugLog) console.log( " ReadPath > " + requestNumber + " - " +  maxIteration + " - " + firstdelay );

    maxIteration++;

    for( var i = 1 ; i < maxIteration && ( ackReceived == false ); i++ ) {
        
        group(`Read Path iteration ${i}`, function() {
            switch(i) {
                case 1:
                    sleep( firstdelay );
                    break;
                case 2:
                    sleep( 0.1 );
                    break;
                case 3:
                    sleep( 1 );
                    break;
                case 4:
                    sleep( 4 );
                    break;
            }
        if (debugLog) console.log(" Get > " + urlRead + requestNumber + readRetryParams + " , " + paramsOption);

        let responseGet = http.get(urlRead + requestNumber + readRetryParams, paramsOption);
            
            switch(responseGet.status) {
                case 200:
                    readPathTime = new Date();
                    readPathOKCounter.add(1);
                    ackReceived=true;  
                    break;
                case 404:
                    readPath404Counter.add(1);
                    if(i==(maxIteration-1)) {
                        resultOutOfAvgCounter.add(1);
                    }
                    break;
                default:
                    readPathKOCounter.add(1);
            }
            check(responseGet, {
                "ReadPath 200 at iteration": (r) => r.status == 200,
                "ReadPath 404 - Not Found": (r) => r.status == 404
            });
            readPathTotalCounter.add(1);
            readPathTrend.add(responseGet.timings.duration);
        })
    }

    return readPathTime;
}

export default function () {
    var RequestNumber1;
    var RequestNumber2;
    var RequestNumber3;
    var writePathTime1 = null;
    var writePathTime2 = null;
    var writePathTime3 = null;
    var readPathTime1 = null;
    var readPathTime2 = null;
    var readPathTime3 = null;

    

    var arrayResult = WritePath();
    writePathTime1 = arrayResult[0];
    RequestNumber1 = arrayResult[1];
    if (debugLog) console.log("RequestNumber,WritePath #1  : " + RequestNumber1 + " - " + writePathTime1);
    sleep(0.1);

    var arrayResult = WritePath();
    writePathTime2 = arrayResult[0];
    RequestNumber2 = arrayResult[1];
    if (debugLog) console.log("RequestNumber,WritePath #2  : " + RequestNumber2 + " - " + writePathTime2);
    sleep(0.1);

    var arrayResult = WritePath();
    writePathTime3 = arrayResult[0];
    RequestNumber3 = arrayResult[1];
    if (debugLog) console.log("RequestNumber,WritePath #3  : " + RequestNumber3 + " - " + writePathTime3);
    sleep(0.1);

    readPathTime1 = ReadPath( RequestNumber1, 4, 0.2 );
    if (debugLog) console.log("readPathTime #1 : " + readPathTime1);

    if(readPathTime1!=null && writePathTime1!=null) {
        roundtripTime.add(DateDiff(readPathTime1,writePathTime1));
    }
    else {
        console.log("ERROR FOR ROUNDTRIP TIME SETTING #1");
    }

    readPathTime2 = ReadPath( RequestNumber2, 4, 0 );
    if (debugLog) console.log("readPathTime #2 : " + readPathTime2);

    if(readPathTime2!=null && writePathTime2!=null) {
        roundtripTime.add(DateDiff(readPathTime2,writePathTime2));
    }
    else {
        console.log("ERROR FOR ROUNDTRIP TIME SETTING #2");
    }

    readPathTime3 = ReadPath( RequestNumber3, 4, 0 ); 
    if (debugLog) console.log("readPathTime #3  : " + readPathTime3);

    if(readPathTime3!=null && writePathTime3!=null) {
        roundtripTime.add(DateDiff(readPathTime3,writePathTime3));
    }
    else {
        console.log("ERROR FOR ROUNDTRIP TIME SETTING #3");
    }
};

/*
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
