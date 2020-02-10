import { DynamicsWebApi } from "../../types/dynamics-web-api-types";
import { ErrorHelper } from "../helpers/ErrorHelper";

/**
 * @typedef {Object} ConvertedRequestOptions
 * @property {string} url URL (without query)
 * @property {string} query Query String
 * @property {Object} headers Heades object (always an Object; can be empty: {})
 */

/**
 * @typedef {Object} ConvertedRequest
 * @property {string} url URL (including Query String)
 * @property {Object} headers Heades object (always an Object; can be empty: {})
 * @property {boolean} async
 */

export class RequestUtility {
    /**
     * Converts a request object to URL link
     *
     * @param {Object} request - Request object
     * @param {string} [functionName] - Name of the function that converts a request (for Error Handling only)
     * @param {Object} [config] - DynamicsWebApi config
     * @returns {ConvertedRequest} Converted request
     */
    static compose(request: DynamicsWebApi.InternalRequest, config: DynamicsWebApi.Config, functionName) {
        var url = '';
        var result;
        if (!request.url) {
            if (!request._isUnboundRequest && !request.collection) {
                ErrorHelper.parameterCheck(request.collection, 'DynamicsWebApi.' + functionName, "request.collection");
            }
            if (request.collection) {
                ErrorHelper.stringParameterCheck(request.collection, 'DynamicsWebApi.' + functionName, "request.collection");
                url = request.collection;

                if (request.contentId) {
                    ErrorHelper.stringParameterCheck(request.contentId, 'DynamicsWebApi.' + functionName, 'request.contentId');
                    if (request.contentId.startsWith('$')) {
                        url = `${request.contentId}/${url}`;
                    }
                }

                //add alternate key feature
                if (request.key) {
                    request.key = ErrorHelper.keyParameterCheck(request.key, 'DynamicsWebApi.' + functionName, "request.key");
                }
                else if (request.id) {
                    request.key = ErrorHelper.guidParameterCheck(request.id, 'DynamicsWebApi.' + functionName, "request.id");
                }

                if (request.key) {
                    url += `(${request.key})`;
                }
            }

            if (request._additionalUrl) {
                if (url) {
                    url += '/';
                }
                url += request._additionalUrl;
            }

            result = RequestUtility.composeUrl(request, functionName, '&', config, url);

            if (request.fetchXml) {
                ErrorHelper.stringParameterCheck(request.fetchXml, 'DynamicsWebApi.' + functionName, "request.fetchXml");
                result.url += "?fetchXml=" + encodeURIComponent(request.fetchXml);
            }
            else
                if (result.query) {
                    result.url += "?" + result.query;
                }
        }
        else {
            ErrorHelper.stringParameterCheck(request.url, 'DynamicsWebApi.' + functionName, "request.url");
            url = request.url.replace(config.webApiUrl, '');
            result = RequestUtility.composeUrl(request, functionName, '&', config, url);
        }

        if (request.hasOwnProperty('async') && request.async != null) {
            ErrorHelper.boolParameterCheck(request.async, 'DynamicsWebApi.' + functionName, "request.async");
            result.async = request.async;
        }
        else {
            result.async = true;
        }

        var headers = RequestUtility.composeHeaders(request, functionName, config);

        return { url: result.url, headers: headers, async: result.async };
    }

    /**
     * Converts optional parameters of the request to URL. If expand parameter exists this function is called recursively.
     *
     * @param {Object} request - Request object
     * @param {string} functionName - Name of the function that converts a request (for Error Handling)
     * @param {string} url - URL beginning (with required parameters)
     * @param {string} [joinSymbol] - URL beginning (with required parameters)
     * @param {Object} [config] - DynamicsWebApi config
     * @returns {ConvertedRequestOptions} Additional options in request
     */
    static composeUrl(request: DynamicsWebApi.InternalRequest, functionName: string, joinSymbol: string, config?, url?: string) {
        var headers = {};
        var requestArray = [];
        joinSymbol = joinSymbol != null ? joinSymbol : '&';

        if (request) {
            if (request.navigationProperty) {
                ErrorHelper.stringParameterCheck(request.navigationProperty, 'DynamicsWebApi.' + functionName, 'request.navigationProperty');
                url += '/' + request.navigationProperty;

                if (request.navigationPropertyKey) {
                    var navigationKey = ErrorHelper.keyParameterCheck(request.navigationPropertyKey, 'DynamicsWebApi.' + functionName, 'request.navigationPropertyKey');
                    url += '(' + navigationKey + ')';
                }

                if (request.navigationProperty === 'Attributes') {
                    if (request.metadataAttributeType) {
                        ErrorHelper.stringParameterCheck(request.metadataAttributeType, 'DynamicsWebApi.' + functionName, 'request.metadataAttributeType');
                        url += '/' + request.metadataAttributeType;
                    }
                }
            }

            if (request.select != null && request.select.length) {
                ErrorHelper.arrayParameterCheck(request.select, 'DynamicsWebApi.' + functionName, 'request.select');

                if (functionName == 'retrieve' && request.select.length == 1 && request.select[0].endsWith('/$ref')) {
                    url += '/' + request.select[0];
                }
                else {
                    if (request.select[0].startsWith('/') && functionName == 'retrieve') {
                        if (request.navigationProperty == null) {
                            url += request.select.shift();
                        }
                        else {
                            request.select.shift();
                        }
                    }

                    //check if anything left in the array
                    if (request.select.length) {
                        requestArray.push('$select=' + request.select.join(','));
                    }
                }
            }

            if (request.filter) {
                ErrorHelper.stringParameterCheck(request.filter, 'DynamicsWebApi.' + functionName, "request.filter");
                var removeBracketsFromGuidReg = /[^"']{([\w\d]{8}[-]?(?:[\w\d]{4}[-]?){3}[\w\d]{12})}(?:[^"']|$)/g;
                var filterResult = request.filter;

                //fix bug 2018-06-11
                var m: RegExpExecArray = null;
                while ((m = removeBracketsFromGuidReg.exec(filterResult)) !== null) {
                    if (m.index === removeBracketsFromGuidReg.lastIndex) {
                        removeBracketsFromGuidReg.lastIndex++;
                    }

                    var replacement = m[0].endsWith(')') ? ')' : ' ';
                    filterResult = filterResult.replace(m[0], ' ' + m[1] + replacement);
                }

                requestArray.push("$filter=" + encodeURIComponent(filterResult));
            }

            if (request.savedQuery) {
                requestArray.push("savedQuery=" + ErrorHelper.guidParameterCheck(request.savedQuery, 'DynamicsWebApi.' + functionName, "request.savedQuery"));
            }

            if (request.userQuery) {
                requestArray.push("userQuery=" + ErrorHelper.guidParameterCheck(request.userQuery, 'DynamicsWebApi.' + functionName, "request.userQuery"));
            }

            if (request.count) {
                ErrorHelper.boolParameterCheck(request.count, 'DynamicsWebApi.' + functionName, "request.count");
                requestArray.push("$count=" + request.count);
            }

            if (request.top && request.top > 0) {
                ErrorHelper.numberParameterCheck(request.top, 'DynamicsWebApi.' + functionName, "request.top");
                requestArray.push("$top=" + request.top);
            }

            if (request.orderBy != null && request.orderBy.length) {
                ErrorHelper.arrayParameterCheck(request.orderBy, 'DynamicsWebApi.' + functionName, "request.orderBy");
                requestArray.push("$orderby=" + request.orderBy.join(','));
            }

            if (request.ifmatch != null && request.ifnonematch != null) {
                throw new Error('DynamicsWebApi.' + functionName + ". Either one of request.ifmatch or request.ifnonematch parameters should be used in a call, not both.");
            }

            if (request.entity) {
                ErrorHelper.parameterCheck(request.entity, 'DynamicsWebApi.' + functionName, 'request.entity');
            }

            if (request.data) {
                ErrorHelper.parameterCheck(request.data, 'DynamicsWebApi.' + functionName, 'request.data');
            }

            if (request.isBatch) {
                ErrorHelper.boolParameterCheck(request.isBatch, 'DynamicsWebApi.' + functionName, 'request.isBatch');
            }

            if (request.expand && request.expand.length) {
                ErrorHelper.stringOrArrayParameterCheck(request.expand, 'DynamicsWebApi.' + functionName, "request.expand");
                if (typeof request.expand === 'string') {
                    requestArray.push('$expand=' + request.expand);
                }
                else {
                    var expandRequestArray = [];
                    for (var i = 0; i < request.expand.length; i++) {
                        if (request.expand[i].property) {
                            var expandConverted = RequestUtility.composeUrl(<DynamicsWebApi.InternalRequest>request.expand[i], functionName + " $expand", ";");
                            var expandQuery = expandConverted.query;
                            if (expandQuery && expandQuery.length) {
                                expandQuery = "(" + expandQuery + ")";
                            }
                            expandRequestArray.push(request.expand[i].property + expandQuery);
                        }
                    }
                    if (expandRequestArray.length) {
                        requestArray.push("$expand=" + expandRequestArray.join(","));
                    }
                }
            }
        }

        return { url: url, query: requestArray.join(joinSymbol), headers: headers };
    }

    static composeHeaders(request: DynamicsWebApi.InternalRequest, functionName: string, config: DynamicsWebApi.Config) {
        var headers: any = {};

        var prefer = RequestUtility.composePreferHeader(request, functionName, config);

        if (prefer.length) {
            headers['Prefer'] = prefer;
        }

        if (request.ifmatch) {
            ErrorHelper.stringParameterCheck(request.ifmatch, 'DynamicsWebApi.' + functionName, "request.ifmatch");
            headers['If-Match'] = request.ifmatch;
        }

        if (request.ifnonematch) {
            ErrorHelper.stringParameterCheck(request.ifnonematch, 'DynamicsWebApi.' + functionName, "request.ifnonematch");
            headers['If-None-Match'] = request.ifnonematch;
        }

        if (request.impersonate) {
            ErrorHelper.stringParameterCheck(request.impersonate, 'DynamicsWebApi.' + functionName, "request.impersonate");
            headers['MSCRMCallerID'] = ErrorHelper.guidParameterCheck(request.impersonate, 'DynamicsWebApi.' + functionName, "request.impersonate");
        }

        if (request.token) {
            ErrorHelper.stringParameterCheck(request.token, 'DynamicsWebApi.' + functionName, "request.token");
            headers['Authorization'] = 'Bearer ' + request.token;
        }

        if (request.duplicateDetection) {
            ErrorHelper.boolParameterCheck(request.duplicateDetection, 'DynamicsWebApi.' + functionName, 'request.duplicateDetection');
            headers['MSCRM.SuppressDuplicateDetection'] = 'false';
        }

        if (request.noCache) {
            ErrorHelper.boolParameterCheck(request.noCache, 'DynamicsWebApi.' + functionName, 'request.noCache');
            headers['Cache-Control'] = 'no-cache';
        }

        if (request.mergeLabels) {
            ErrorHelper.boolParameterCheck(request.mergeLabels, 'DynamicsWebApi.' + functionName, 'request.mergeLabels');
            headers['MSCRM.MergeLabels'] = 'true';
        }

        if (request.contentId) {
            ErrorHelper.stringParameterCheck(request.contentId, 'DynamicsWebApi.' + functionName, 'request.contentId');
            if (!request.contentId.startsWith('$')) {
                headers['Content-ID'] = request.contentId;
            }
        }
    }

    static composePreferHeader (request, functionName, config) {
        var returnRepresentation = request.returnRepresentation;
        var includeAnnotations = request.includeAnnotations;
        var maxPageSize = request.maxPageSize;
        var trackChanges = request.trackChanges;

        var prefer;

        if (request.prefer && request.prefer.length) {
            ErrorHelper.stringOrArrayParameterCheck(request.prefer, "DynamicsWebApi." + functionName, "request.prefer");
            prefer = request.prefer;
            if (typeof prefer === "string") {
                prefer = prefer.split(',');
            }
            for (var i in prefer) {
                var item = prefer[i].trim();
                if (item === "return=representation") {
                    returnRepresentation = true;
                }
                else if (item.indexOf("odata.include-annotations=") > -1) {
                    includeAnnotations = item.replace('odata.include-annotations=', '').replace(/"/g, '');
                }
                else if (item.startsWith("odata.maxpagesize=")) {
                    maxPageSize = item.replace('odata.maxpagesize=', '').replace(/"/g, '');
                }
                else if (item.indexOf("odata.track-changes") > -1) {
                    trackChanges = true;
                }
            }
        }

        prefer = [];

        if (config) {
            if (returnRepresentation == null) {
                returnRepresentation = config.returnRepresentation;
            }
            includeAnnotations = includeAnnotations ? includeAnnotations : config.includeAnnotations;
            maxPageSize = maxPageSize ? maxPageSize : config.maxPageSize;
        }

        if (returnRepresentation) {
            ErrorHelper.boolParameterCheck(returnRepresentation, "DynamicsWebApi." + functionName, "request.returnRepresentation");
            prefer.push("return=representation");
        }

        if (includeAnnotations) {
            ErrorHelper.stringParameterCheck(includeAnnotations, "DynamicsWebApi." + functionName, "request.includeAnnotations");
            prefer.push('odata.include-annotations="' + includeAnnotations + '"');
        }

        if (maxPageSize && maxPageSize > 0) {
            ErrorHelper.numberParameterCheck(maxPageSize, "DynamicsWebApi." + functionName, "request.maxPageSize");
            prefer.push('odata.maxpagesize=' + maxPageSize);
        }

        if (trackChanges) {
            ErrorHelper.boolParameterCheck(trackChanges, "DynamicsWebApi." + functionName, "request.trackChanges");
            prefer.push('odata.track-changes');
        }

        return prefer.join(',');
    }
};