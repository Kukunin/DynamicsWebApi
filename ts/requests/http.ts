﻿//var http = require('http');
import * as http from "http";
import * as https from "https";
import * as url from "url";
import { DynamicsWebApi } from "../../types/dynamics-web-api-types";
import { ErrorHelper } from "./../helpers/ErrorHelper";
import { parseResponse } from "./helpers/parseResponse";

/**
 * Sends a request to given URL with given parameters
 *
 */
function httpRequest(options: DynamicsWebApi.RequestOptions) {
    var method = options.method;
    var uri = options.uri;
    var data = options.data;
    var additionalHeaders = options.additionalHeaders;
    var responseParams = options.responseParams;
    var successCallback = options.successCallback;
    var errorCallback = options.errorCallback;
    var timeout = options.timeout;

    var headers: http.OutgoingHttpHeaders = {};

    if (data) {
        headers["Content-Type"] = additionalHeaders['Content-Type'];
        headers["Content-Length"] = data.length;

        delete additionalHeaders['Content-Type'];
    }

    //set additional headers
    for (var key in additionalHeaders) {
        headers[key] = additionalHeaders[key];
    }

    var parsedUrl = url.parse(uri);
    var protocol = parsedUrl.protocol.replace(':', '');
    var protocolInterface = protocol === 'http' ? http : https;

    var internalOptions: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: method,
        timeout: timeout,
        headers: headers
    };

    if (process.env[`${protocol}_proxy`]) {
        /*
         * Proxied requests don't work with Node's https module so use http to
         * talk to the proxy server regardless of the endpoint protocol. This
         * is unsuitable for environments where requests are expected to be
         * using end-to-end TLS.
         */
        protocolInterface = http;
        var proxyUrl = url.parse(process.env.http_proxy);
        headers.host = parsedUrl.host;
        internalOptions = {
            hostname: proxyUrl.hostname,
            port: proxyUrl.port,
            path: parsedUrl.href,
            method: method,
            timeout: timeout,
            headers: headers
        };
    }

    var request = protocolInterface.request(internalOptions, function (res) {
        var rawData = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            rawData += chunk;
        });
        res.on('end', function () {
            switch (res.statusCode) {
                case 200: // Success with content returned in response body.
                case 201: // Success with content returned in response body.
                case 204: // Success with no content returned in response body.
                case 304: {// Success with Not Modified
                    var responseData = parseResponse(rawData, res.headers, responseParams);

                    var response = {
                        data: responseData,
                        headers: res.headers,
                        status: res.statusCode
                    };

                    successCallback(response);
                    break;
                }
                default: // All other statuses are error cases.
                    var crmError;
                    try {
                        var errorParsed = parseResponse(rawData, res.headers, responseParams);

                        if (Array.isArray(errorParsed)) {
                            errorCallback(errorParsed);
                            break;
                        }

                        crmError = errorParsed.hasOwnProperty('error') && errorParsed.error
                            ? errorParsed.error
                            : { message: errorParsed.Message };
                    } catch (e) {
                        if (rawData.length > 0) {
                            crmError = { message: rawData };
                        }
                        else {
                            crmError = { message: "Unexpected Error" };
                        }
                    }

                    errorCallback(ErrorHelper.handleHttpError(crmError, { status: res.statusCode, statusText: "", statusMessage: res.statusMessage }));
                    break;
            }

            responseParams.length = 0;
        });
    });

    if (internalOptions.timeout) {
        request.setTimeout(internalOptions.timeout, function () {
            request.abort();
        });
    }

    request.on('error', function (error) {
        responseParams.length = 0;
        errorCallback(error);
    });

    if (data) {
        request.write(data);
    }

    request.end();
}

export = httpRequest;