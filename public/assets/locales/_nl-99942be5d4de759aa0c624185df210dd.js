/*global I18n:true */

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement, fromIndex) {
    if ( this === undefined || this === null ) {
      throw new TypeError( '"this" is null or not defined' );
    }

    var length = this.length >>> 0; // Hack to convert object.length to a UInt32

    fromIndex = +fromIndex || 0;

    if (Math.abs(fromIndex) === Infinity) {
      fromIndex = 0;
    }

    if (fromIndex < 0) {
      fromIndex += length;
      if (fromIndex < 0) {
        fromIndex = 0;
      }
    }

    for (;fromIndex < length; fromIndex++) {
      if (this[fromIndex] === searchElement) {
        return fromIndex;
      }
    }

    return -1;
  };
}

// Instantiate the object
var I18n = I18n || {};

// Set default locale to english
I18n.defaultLocale = "en";

// Set default handling of translation fallbacks to false
I18n.fallbacks = false;

// Set default separator
I18n.defaultSeparator = ".";

// Set current locale to null
I18n.locale = null;

// Set the placeholder format. Accepts `{{placeholder}}` and `%{placeholder}`.
I18n.PLACEHOLDER = /(?:\{\{|%\{)(.*?)(?:\}\}?)/gm;

I18n.fallbackRules = {};

I18n.noFallbacks = false;

I18n.pluralizationRules = {
  en: function(n) {
    return n === 0 ? ["zero", "none", "other"] : n === 1 ? "one" : "other";
  },
  "zh_CN": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "zh_TW": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  },
  "ko": function(n) {
    return n === 0 ? ["zero", "none", "other"] : "other";
  }
};

I18n.getFallbacks = function(locale) {
  if (locale === I18n.defaultLocale) {
    return [];
  } else if (!I18n.fallbackRules[locale]) {
    var rules = [],
        components = locale.split("-");

    for (var l = 1; l < components.length; l++) {
      rules.push(components.slice(0, l).join("-"));
    }

    rules.push(I18n.defaultLocale);

    I18n.fallbackRules[locale] = rules;
  }

  return I18n.fallbackRules[locale];
};

I18n.isValidNode = function(obj, node, undefined) {
  return obj[node] !== null && obj[node] !== undefined;
};

I18n.lookup = function(scope, options) {
  options = options || {};
  var lookupInitialScope = scope,
      translations = this.prepareOptions(I18n.translations),
      locale = options.locale || I18n.currentLocale(),
      messages = translations[locale] || {},
      currentScope;

  options = this.prepareOptions(options);

  if (typeof scope === "object") {
    scope = scope.join(this.defaultSeparator);
  }

  if (options.scope) {
    scope = options.scope.toString() + this.defaultSeparator + scope;
  }

  scope = scope.split(this.defaultSeparator);

  while (messages && scope.length > 0) {
    currentScope = scope.shift();
    messages = messages[currentScope];
  }

  if (!messages) {
    if (I18n.fallbacks) {
      var fallbacks = this.getFallbacks(locale);
      for (var fallback = 0; fallback < fallbacks.length; fallbacks++) {
        messages = I18n.lookup(lookupInitialScope, this.prepareOptions({locale: fallbacks[fallback]}, options));
        if (messages) {
          break;
        }
      }
    }

    if (!messages && this.isValidNode(options, "defaultValue")) {
        messages = options.defaultValue;
    }
  }

  return messages;
};

// Merge serveral hash options, checking if value is set before
// overwriting any value. The precedence is from left to right.
//
//   I18n.prepareOptions({name: "John Doe"}, {name: "Mary Doe", role: "user"});
//   #=> {name: "John Doe", role: "user"}
//
I18n.prepareOptions = function() {
  var options = {},
      opts,
      count = arguments.length;

  for (var i = 0; i < count; i++) {
    opts = arguments[i];

    if (!opts) {
      continue;
    }

    for (var key in opts) {
      if (!this.isValidNode(options, key)) {
        options[key] = opts[key];
      }
    }
  }

  return options;
};

I18n.interpolate = function(message, options) {
  options = this.prepareOptions(options);
  var matches = message.match(this.PLACEHOLDER),
      placeholder,
      value,
      name;

  if (!matches) {
    return message;
  }

  for (var i = 0; placeholder = matches[i]; i++) {
    name = placeholder.replace(this.PLACEHOLDER, "$1");

    value = options[name];

    if (!this.isValidNode(options, name)) {
      value = "[missing " + placeholder + " value]";
    }

    var regex = new RegExp(placeholder.replace(/\{/gm, "\\{").replace(/\}/gm, "\\}"));
    message = message.replace(regex, value);
  }

  return message;
};

I18n.translate = function(scope, options) {
  options = this.prepareOptions(options);
  var translation = this.lookup(scope, options);
  // Fallback to the default locale
  if (!translation && this.currentLocale() !== this.defaultLocale && !this.noFallbacks) {
    options.locale = this.defaultLocale;
    translation = this.lookup(scope, options);
  }
  if (!translation && this.currentLocale() !== 'en' && !this.noFallbacks) {
    options.locale = 'en';
    translation = this.lookup(scope, options);
  }

  try {
    if (typeof translation === "object") {
      if (typeof options.count === "number") {
        return this.pluralize(options.count, scope, options);
      } else {
        return translation;
      }
    } else {
      return this.interpolate(translation, options);
    }
  } catch (error) {
    return this.missingTranslation(scope);
  }
};

I18n.localize = function(scope, value) {
  switch (scope) {
    case "currency":
      return this.toCurrency(value);
    case "number":
      scope = this.lookup("number.format");
      return this.toNumber(value, scope);
    case "percentage":
      return this.toPercentage(value);
    default:
      if (scope.match(/^(date|time)/)) {
        return this.toTime(scope, value);
      } else {
        return value.toString();
      }
  }
};

I18n.parseDate = function(date) {
  var matches, convertedDate;

  // we have a date, so just return it.
  if (typeof date === "object") {
    return date;
  }

  // it matches the following formats:
  //   yyyy-mm-dd
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ss
  //   yyyy-mm-dd[ T]hh:mm::ssZ
  //   yyyy-mm-dd[ T]hh:mm::ss+0000
  //
  matches = date.toString().match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|\+0000)?/);

  if (matches) {
    for (var i = 1; i <= 6; i++) {
      matches[i] = parseInt(matches[i], 10) || 0;
    }

    // month starts on 0
    matches[2] -= 1;

    if (matches[7]) {
      convertedDate = new Date(Date.UTC(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]));
    } else {
      convertedDate = new Date(matches[1], matches[2], matches[3], matches[4], matches[5], matches[6]);
    }
  } else if (typeof date === "number") {
    // UNIX timestamp
    convertedDate = new Date();
    convertedDate.setTime(date);
  } else if (date.match(/\d+ \d+:\d+:\d+ [+-]\d+ \d+/)) {
    // a valid javascript format with timezone info
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  } else {
    // an arbitrary javascript string
    convertedDate = new Date();
    convertedDate.setTime(Date.parse(date));
  }

  return convertedDate;
};

I18n.toTime = function(scope, d) {
  var date = this.parseDate(d),
      format = this.lookup(scope);

  if (date.toString().match(/invalid/i)) {
    return date.toString();
  }

  if (!format) {
    return date.toString();
  }

  return this.strftime(date, format);
};

I18n.strftime = function(date, format) {
  var options = this.lookup("date");

  if (!options) {
    return date.toString();
  }

  options.meridian = options.meridian || ["AM", "PM"];

  var weekDay = date.getDay(),
      day = date.getDate(),
      year = date.getFullYear(),
      month = date.getMonth() + 1,
      hour = date.getHours(),
      hour12 = hour,
      meridian = hour > 11 ? 1 : 0,
      secs = date.getSeconds(),
      mins = date.getMinutes(),
      offset = date.getTimezoneOffset(),
      absOffsetHours = Math.floor(Math.abs(offset / 60)),
      absOffsetMinutes = Math.abs(offset) - (absOffsetHours * 60),
      timezoneoffset = (offset > 0 ? "-" : "+") + (absOffsetHours.toString().length < 2 ? "0" + absOffsetHours : absOffsetHours) + (absOffsetMinutes.toString().length < 2 ? "0" + absOffsetMinutes : absOffsetMinutes);

  if (hour12 > 12) {
    hour12 = hour12 - 12;
  } else if (hour12 === 0) {
    hour12 = 12;
  }

  var padding = function(n) {
    var s = "0" + n.toString();
    return s.substr(s.length - 2);
  };

  var f = format;
  f = f.replace("%a", options.abbr_day_names[weekDay]);
  f = f.replace("%A", options.day_names[weekDay]);
  f = f.replace("%b", options.abbr_month_names[month]);
  f = f.replace("%B", options.month_names[month]);
  f = f.replace("%d", padding(day));
  f = f.replace("%e", day);
  f = f.replace("%-d", day);
  f = f.replace("%H", padding(hour));
  f = f.replace("%-H", hour);
  f = f.replace("%I", padding(hour12));
  f = f.replace("%-I", hour12);
  f = f.replace("%m", padding(month));
  f = f.replace("%-m", month);
  f = f.replace("%M", padding(mins));
  f = f.replace("%-M", mins);
  f = f.replace("%p", options.meridian[meridian]);
  f = f.replace("%S", padding(secs));
  f = f.replace("%-S", secs);
  f = f.replace("%w", weekDay);
  f = f.replace("%y", padding(year));
  f = f.replace("%-y", padding(year).replace(/^0+/, ""));
  f = f.replace("%Y", year);
  f = f.replace("%z", timezoneoffset);

  return f;
};

I18n.toNumber = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ",", strip_insignificant_zeros: false}
  );

  var negative = number < 0,
      string = Math.abs(number).toFixed(options.precision).toString(),
      parts = string.split("."),
      precision,
      buffer = [],
      formattedNumber;

  number = parts[0];
  precision = parts[1];

  while (number.length > 0) {
    buffer.unshift(number.substr(Math.max(0, number.length - 3), 3));
    number = number.substr(0, number.length -3);
  }

  formattedNumber = buffer.join(options.delimiter);

  if (options.precision > 0) {
    formattedNumber += options.separator + parts[1];
  }

  if (negative) {
    formattedNumber = "-" + formattedNumber;
  }

  if (options.strip_insignificant_zeros) {
    var regex = {
        separator: new RegExp(options.separator.replace(/\./, "\\.") + "$"),
        zeros: /0+$/
    };

    formattedNumber = formattedNumber
      .replace(regex.zeros, "")
      .replace(regex.separator, "")
    ;
  }

  return formattedNumber;
};

I18n.toCurrency = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.currency.format"),
    this.lookup("number.format"),
    {unit: "$", precision: 2, format: "%u%n", delimiter: ",", separator: "."}
  );

  number = this.toNumber(number, options);
  number = options.format
    .replace("%u", options.unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toHumanSize = function(number, options) {
  var kb = 1024,
      size = number,
      iterations = 0,
      unit,
      precision;

  while (size >= kb && iterations < 4) {
    size = size / kb;
    iterations += 1;
  }

  if (iterations === 0) {
    unit = this.t("number.human.storage_units.units.byte", {count: size});
    precision = 0;
  } else {
    unit = this.t("number.human.storage_units.units." + [null, "kb", "mb", "gb", "tb"][iterations]);
    precision = (size - Math.floor(size) === 0) ? 0 : 1;
  }

  options = this.prepareOptions(
    options,
    {precision: precision, format: "%n%u", delimiter: ""}
  );

  number = this.toNumber(size, options);
  number = options.format
    .replace("%u", unit)
    .replace("%n", number)
  ;

  return number;
};

I18n.toPercentage = function(number, options) {
  options = this.prepareOptions(
    options,
    this.lookup("number.percentage.format"),
    this.lookup("number.format"),
    {precision: 3, separator: ".", delimiter: ""}
  );

  number = this.toNumber(number, options);
  return number + "%";
};

I18n.pluralizer = function(locale) {
  var pluralizer = this.pluralizationRules[locale];
  if (pluralizer !== undefined) return pluralizer;
  return this.pluralizationRules["en"];
};

I18n.findAndTranslateValidNode = function(keys, translation) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (this.isValidNode(translation, key)) return translation[key];
  }
  return null;
};

I18n.pluralize = function(count, scope, options) {
  var translation;

  try { translation = this.lookup(scope, options); } catch (error) {}
  if (!translation) { return this.missingTranslation(scope); }

  options = this.prepareOptions(options);
  options.count = count.toString();

  var pluralizer = this.pluralizer(this.currentLocale());
  var key = pluralizer(Math.abs(count));
  var keys = ((typeof key === "object") && (key instanceof Array)) ? key : [key];

  var message = this.findAndTranslateValidNode(keys, translation);
  if (message == null) message = this.missingTranslation(scope, keys[0]);

  return this.interpolate(message, options);
};

I18n.missingTranslation = function(scope, key) {
  var message = '[' + this.currentLocale() + "." + scope;
  if (key) { message += "." + key; }
  return message + ']';
};

I18n.currentLocale = function() {
  return (I18n.locale || I18n.defaultLocale);
};

// shortcuts
I18n.t = I18n.translate;
I18n.l = I18n.localize;
I18n.p = I18n.pluralize;

I18n.enable_verbose_localization = function(){
  var counter = 0;
  var keys = {};
  var t = I18n.t;

  I18n.noFallbacks = true;

  I18n.t = I18n.translate = function(scope, value){
    var current = keys[scope];
    if(!current) {
      current = keys[scope] = ++counter;
      var message = "Translation #" + current + ": " + scope;
      if (!_.isEmpty(value)) {
        message += ", parameters: " + JSON.stringify(value);
      }
      Em.Logger.info(message);
    }
    return t.apply(I18n, [scope, value]) + " (t" + current + ")";
  };
};


I18n.verbose_localization_session = function(){
  sessionStorage.setItem("verbose_localization", "true");
  I18n.enable_verbose_localization();
  return true;
}

try {
  if(sessionStorage && sessionStorage.getItem("verbose_localization")) {
    I18n.enable_verbose_localization();
  }
} catch(e){
  // we don't care really, can happen if cookies disabled
}
;


MessageFormat = {locale: {}};
MessageFormat.locale.nl = function ( n ) {
  if ( n === 1 ) {
    return "one";
  }
  return "other";
};

I18n.messageFormat = (function(formats){
      var f = formats;
      return function(key, options) {
        var fn = f[key];
        if(fn){
          try {
            return fn(options);
          } catch(err) {
            return err.message;
          }
        } else {
          return 'Missing Key: ' + key
        }
        return f[key](options);
      };
    })({"topic.read_more_MF" : function(d){
var r = "";
r += "Er ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "UNREAD";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"0" : function(d){
var r = "";
return r;
},
"one" : function(d){
var r = "";
r += "is <a href='/unread'>1 ongelezen</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "zijn <a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " ongelezen</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["nl"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "NEW";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"0" : function(d){
var r = "";
return r;
},
"one" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_2 = "BOTH";
var k_2=d[lastkey_2];
var off_1 = 0;
var pf_1 = { 
"true" : function(d){
var r = "";
r += "and ";
return r;
},
"false" : function(d){
var r = "";
r += "is ";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>1 nieuw</a> topic";
return r;
},
"other" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_2 = "BOTH";
var k_2=d[lastkey_2];
var off_1 = 0;
var pf_1 = { 
"true" : function(d){
var r = "";
r += "and ";
return r;
},
"false" : function(d){
var r = "";
r += "zijn ";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " nieuwe</a> topics";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["nl"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " over, of ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "blader door andere topics in ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
r += d["catLink"];
return r;
},
"false" : function(d){
var r = "";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
r += d["latestLink"];
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_0[ k_1 ] || pf_0[ "other" ])( d );
return r;
} , "posts_likes_MF" : function(d){
var r = "";
r += "Dit topic heeft ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 antwoord";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " antwoorden";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["nl"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "ratio";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"low" : function(d){
var r = "";
r += "met een hoge likes per post verhouding";
return r;
},
"med" : function(d){
var r = "";
r += "met een erg hoge likes per post verhouding";
return r;
},
"high" : function(d){
var r = "";
r += "met een zeer hoge likes per post verhouding";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_0[ k_1 ] || pf_0[ "other" ])( d );
r += "\n";
return r;
}});I18n.translations = {"nl":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Bytes"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}u"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1j","other":"%{count}j"},"over_x_years":{"one":"\u003e 1j","other":"\u003e %{count}j"},"almost_x_years":{"one":"1j","other":"%{count}j"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 min","other":"%{count} mins"},"x_hours":{"one":"1 uur","other":"%{count} uren"},"x_days":{"one":"1 dag","other":"%{count} dagen"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"one":"1 min geleden","other":"%{count} mins geleden"},"x_hours":{"one":"1 uur geleden","other":"%{count} uren geleden"},"x_days":{"one":"1 day geleden","other":"%{count} dagen geleden"}},"later":{"x_days":{"one":"1 dag later","other":"%{count} dagen later"},"x_months":{"one":"1 maand later","other":"%{count} maanden later"},"x_years":{"one":"1 jaar later","other":"%{count} jaren later"}}},"share":{"topic":"deel een link naar deze topic","post":"bericht #%{postNumber}","close":"sluit","twitter":"deel deze link op Twitter","facebook":"deel deze link op Facebook","google+":"deel deze link op Google+","email":"deel deze link via e-mail"},"action_codes":{"split_topic":"deze topic splitsen %{when}","autoclosed":{"enabled":"gesloten %{when}","disabled":"geopend %{when}"},"closed":{"enabled":"gesloten %{when}","disabled":"geopend %{when}"},"archived":{"enabled":"gearchiveerd %{when}","disabled":"gedearchiveerd %{when}"},"pinned":{"enabled":"vastgepind %{when}","disabled":"niet vastgepind %{when}"},"pinned_globally":{"enabled":"globaal vastgepind %{when}","disabled":"niet vastgepind %{when}"},"visible":{"enabled":"zichtbaar %{when}","disabled":"niet zichtbaar %{when}"}},"topic_admin_menu":"Adminacties voor topic","emails_are_disabled":"Alle uitgaande e-mails zijn uitgeschakeld door een beheerder. Geen enkele vorm van e-mail notificatie wordt verstuurd.","edit":"bewerk de titel en categorie van deze topic","not_implemented":"Die functie is helaas nog niet beschikbaar. Sorry!","no_value":"Nee","yes_value":"Ja","generic_error":"Sorry, er is iets fout gegaan.","generic_error_with_reason":"Er is iets fout gegaan: %{error}","sign_up":"Aanmelden","log_in":"Inloggen","age":"Leeftijd","joined":"Lid sinds","admin_title":"Beheer","flags_title":"Meldingen","show_more":"meer...","show_help":"opties","links":"Links","links_lowercase":{"one":"link","other":"links"},"faq":"FAQ","guidelines":"Richtlijnen","privacy_policy":"Privacy Policy","privacy":"Privacy","terms_of_service":"Algemene Voorwaarden","mobile_view":"Mobiele versie","desktop_view":"Desktop weergave","you":"Jij","or":"of","now":"zonet","read_more":"lees verder","more":"Meer","less":"Minder","never":"nooit","daily":"dagelijks","weekly":"wekelijks","every_two_weeks":"elke twee weken","every_three_days":"elke drie dagen","max_of_count":"maximaal {{count}}","alternation":"of","character_count":{"one":"{{count}} teken","other":"{{count}} tekens"},"suggested_topics":{"title":"Aanbevolen topics"},"about":{"simple_title":"Over","title":"Over %{title}","stats":"Site statistieken","our_admins":"Onze beheerders","our_moderators":"Onze moderators","stat":{"all_time":"Sinds het begin","last_7_days":"Afgelopen 7 dagen","last_30_days":"Afgelopen 30 dagen"},"like_count":"Likes","topic_count":"Topics","post_count":"Berichten","user_count":"Nieuwe leden","active_user_count":"Actieve leden","contact":"Neem contact met ons op","contact_info":"In het geval van een kritieke kwestie of dringende vraagstukken in verband met deze site, neem contact op met ons op via %{contact_info}."},"bookmarked":{"title":"Voeg toe aan favorieten","clear_bookmarks":"Verwijder favorieten","help":{"bookmark":"Klik om het eerste bericht van deze topic toe te voegen aan je favorieten","unbookmark":"Klik om alle favorieten in dit topic te verwijderen"}},"bookmarks":{"not_logged_in":"sorry, je moet ingelogd zijn om berichten aan je favorieten toe te kunnen voegen","created":"je hebt dit bericht aan je favorieten toegevoegd","not_bookmarked":"je hebt dit bericht gelezen; klik om het aan je favorieten toe te voegen","last_read":"dit is het laatste bericht dat je gelezen hebt; klik om het aan je favorieten toe te voegen","remove":"Verwijder favoriet","confirm_clear":"Weet je zeker dat je alle favorieten in dit topic wilt verwijderen?"},"topic_count_latest":{"one":"{{count}} nieuwe of aangepaste discussie.","other":"{{count}} nieuwe of bijgewerkte topics."},"topic_count_unread":{"one":"{{count}} ongelezen discussie.","other":"{{count}} ongelezen topics."},"topic_count_new":{"one":"{{count}} nieuwe discussie. ","other":"{{count}} nieuwe topics."},"click_to_show":"Klik om te bekijken.","preview":"voorbeeld","cancel":"annuleer","save":"Bewaar wijzigingen","saving":"Wordt opgeslagen...","saved":"Opgeslagen!","upload":"Upload","uploading":"Uploaden...","uploading_filename":"Uploaden {{filename}}...","uploaded":"Geupload!","enable":"Inschakelen","disable":"Uitschakelen","undo":"Herstel","revert":"Zet terug","failed":"Mislukt","switch_to_anon":"Anonieme modus","switch_from_anon":"Anoniem afsluiten","banner":{"close":"Verberg deze banner.","edit":"Wijzig deze banner \u003e\u003e"},"choose_topic":{"none_found":"Geen topics gevonden.","title":{"search":"Zoek naar een topic op naam, url of id:","placeholder":"typ hier de titel van de topic"}},"queue":{"topic":"Topic:","approve":"Accepteer","reject":"Weiger","delete_user":"Verwijder gebruiker","title":"Heeft goedkeuring nodig","none":"Er zijn geen berichten om te beoordelen","edit":"Wijzig","cancel":"Annuleer","view_pending":"bekijk wachtende berichten","has_pending_posts":{"one":"Voor deze topic staat \u003cb\u003e1\u003c/b\u003e bericht klaar om goedgekeurd te worden","other":"Voor dit topic staan \u003cb\u003e{{count}}\u003c/b\u003e berichten klaar om goedgekeurd te worden"},"confirm":"Sla wijzigingen op","delete_prompt":"Weet je zeker dat je \u003cb\u003e%{username}\u003c/b\u003e wilt verwijderen? Dit zal alle zijn berichten verwijderen en zal zijn email en ip-adres blokkeren.","approval":{"title":"Bericht vereist goedkeuring","description":"We hebben je nieuwe bericht ontvangen, maar deze moet eerst goedgekeurd worden door een moderator voordat deze zichtbaar wordt. Wees a.u.b. geduldig.","pending_posts":{"one":"Je hebt \u003cstrong\u003e1\u003c/strong\u003e bericht in afwachting.","other":"Je hebt \u003cstrong\u003e{{count}}\u003c/strong\u003e berichten in afwachting."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e plaatste \u003ca href='{{topicUrl}}'\u003edeze topic\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eJij\u003c/a\u003e plaatste \u003ca href='{{topicUrl}}'\u003edeze topic\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e reageerde op \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eJij\u003c/a\u003e reageerde op \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e reageerde op \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eJij\u003c/a\u003e reageerde op \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e noemde \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e noemde \u003ca href='{{user2Url}}'\u003ejou\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eJij\u003c/a\u003e noemde \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Geplaatst door \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Geplaatst door \u003ca href='{{userUrl}}'\u003ejou\u003c/a\u003e","sent_by_user":"Verzonden door \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Verzonden door \u003ca href='{{userUrl}}'\u003ejou\u003c/a\u003e"},"directory":{"filter_name":"filter op gebruikersnaam","title":"Leden","likes_given":"Gegeven","likes_received":"Ontvangen","topics_entered":"Bezocht","topics_entered_long":"Topics bezocht","time_read":"Tijd gelezen","topic_count":"Topics","topic_count_long":"Topics gemaakt","post_count":"Antwoorden","post_count_long":"Reacties gepost","no_results":"Geen resultaten gevonden.","days_visited":"Bezoeken","days_visited_long":"Dagen bezocht","posts_read":"Gelezen","posts_read_long":"Berichten gelezen","total_rows":{"one":"1 lid","other":"%{count} leden"}},"groups":{"add":"Voeg toe","selector_placeholder":"Voeg leden toe","owner":"eigenaar","visible":"Groep is zichtbaar voor alle gebruikers","title":{"one":"groep","other":"groepen"},"members":"Leden","posts":"Berichten","alias_levels":{"title":"Wie kan deze groep als alias gebruiken?","nobody":"Niemand","only_admins":"Alleen admins","mods_and_admins":"Alleen moderatoren and admins","members_mods_and_admins":"Alleen leden van de groep, moderatoren en admins","everyone":"Iedereen"},"trust_levels":{"title":"Trustlevel dat automatisch wordt toegekend aan nieuwe gebruikers:","none":"Geen"}},"user_action_groups":{"1":"Likes gegeven","2":"Likes ontvangen","3":"Bladwijzers","4":"Topics","5":"Reacties","6":"Reacties","7":"Genoemd","9":"Citaten","10":"Met ster","11":"Wijzigingen","12":"Verzonden items","13":"Inbox","14":"In behandeling"},"categories":{"all":"alle categorieën","all_subcategories":"alle","no_subcategory":"geen","category":"Categorie","reorder":{"title":"Categorieën Herschikken ","title_long":"Reorganiseer de categorielijst","fix_order":"Posities fixen","fix_order_tooltip":"Niet alle categorien hebben een unieke nummer, dit resulteert soms in onverwachte resultaten.","save":"Volgorde Opslaan","apply_all":"Toepassen","position":"Positie"},"posts":"Berichten","topics":"Topics","latest":"Laatste","latest_by":"Laatste door","toggle_ordering":"schakel sorteermethode","subcategories":"Subcategorieën","topic_stats":"The number of new topics.","topic_stat_sentence":{"one":"%{count} nieuw topic in de afgelopen %{unit}.","other":"%{count} nieuwe topics in de afgelopen %{unit}."},"post_stats":"Het aantal nieuwe berichten.","post_stat_sentence":{"one":"%{count} nieuw bericht in de afgelopen %{unit}.","other":"%{count} nieuwe berichten in de afgelopen %{unit}."}},"ip_lookup":{"title":"IP-adres lookup","hostname":"Hostname","location":"Locatie","location_not_found":"(onbekend)","organisation":"Organisatie","phone":"Telefoon","other_accounts":"Andere accounts met dit IP-adres","delete_other_accounts":"Verwijder %{count}","username":"gebruikersnaam","trust_level":"TL","read_time":"leestijd","topics_entered":"topics ingevoerd","post_count":"# berichten","confirm_delete_other_accounts":"Weet je zeker dat je deze accounts wil verwijderen?"},"user_fields":{"none":"(selecteer een optie)"},"user":{"said":"{{username}}:","profile":"Profiel","mute":"Negeer","edit":"Wijzig voorkeuren","download_archive":"Download mijn berichten","new_private_message":"Nieuw bericht","private_message":"Bericht","private_messages":"Berichten","activity_stream":"Activiteit","preferences":"Voorkeuren","expand_profile":"Uitklappen","bookmarks":"Bladwijzers","bio":"Over mij","invited_by":"Uitgenodigd door","trust_level":"Trustlevel","notifications":"Notificaties","desktop_notifications":{"label":"Desktop Notificaties","not_supported":"Notificaties worden niet ondersteund door deze browser. Sorry.","perm_default":"Notificaties Aanzetten","perm_denied_btn":"Toestemming Geweigerd","perm_denied_expl":"Gebruik van notificaties staat niet ingeschakeld. Gebruik je browser om notificaties toe te staan, klik vervolgens op de knop. (Desktop: Het meest linkse icoon op de adresbalk. Mobiel: 'Site Info' )","disable":"Notificaties Uitschakelen","currently_enabled":"(momenteel ingeschakeld)","enable":"Notificaties Inschakelen","currently_disabled":"(momenteel uitgeschakeld)","each_browser_note":"Let op: Je moet deze optie instellen voor elke browser die je gebruikt."},"dismiss_notifications":"Markeer alles als gelezen","dismiss_notifications_tooltip":"Markeer alle ongelezen berichten als gelezen","disable_jump_reply":"Niet naar je nieuwe bericht gaan na reageren","dynamic_favicon":"Laat aantal nieuwe / bijgewerkte berichten zien in favicon","edit_history_public":"Laat andere gebruikers mijn aanpassingen aan dit bericht zien.","external_links_in_new_tab":"Open alle externe links in een nieuw tabblad","enable_quoting":"Activeer antwoord-met-citaat voor geselecteerde tekst","change":"verander","moderator":"{{user}} is een moderator","admin":"{{user}} is een beheerder","moderator_tooltip":"Deze gebruiker is een moderator","admin_tooltip":"Deze gebruiker is een admin","blocked_tooltip":"Deze gebruiker is geblokeerd","suspended_notice":"Deze gebruiker is geschorst tot {{date}}.","suspended_reason":"Reden: ","github_profile":"Github","mailing_list_mode":"Ontvang een mail als er een nieuw bericht op het forum geplaatst is (tenzij je het topic of de betreffende categorie op stil zet)","watched_categories":"In de gaten gehouden","watched_categories_instructions":"Je krijgt automatisch alle nieuwe topics in deze categorie te zien. Je ontvangt notificaties bij nieuwe berichten en topics, naast het topic wordt het aantal nieuwe berichten weergegeven. ","tracked_categories":"Gevolgd","tracked_categories_instructions":"Je volgt automatisch alle nieuwe topics in deze categorie. Naast het topic wordt het aantal nieuwe berichten weergegeven.","muted_categories":"Genegeerd","muted_categories_instructions":"Je zal geen notificaties krijgen over nieuwe onderwerpen en berichten in deze categorieën en ze verschijnen niet op je ongelezen overzicht.","delete_account":"Verwijder mijn account","delete_account_confirm":"Weet je zeker dat je je account definitief wil verwijderen? Dit kan niet meer ongedaan gemaakt worden!","deleted_yourself":"Je account is verwijderd.","delete_yourself_not_allowed":"Je kan je account nu niet verwijderen. Neem contact op met een admin om je account te laten verwijderen.","unread_message_count":"Berichten","admin_delete":"Verwijder","users":"Leden","muted_users":"Negeren","muted_users_instructions":"Negeer alle meldingen van deze leden.","muted_topics_link":"Toon gedempte topics.","staff_counters":{"flags_given":"behulpzame markeringen","flagged_posts":"gemarkeerde berichten","deleted_posts":"verwijderde berichten","suspensions":"schorsingen","warnings_received":"waarschuwingen"},"messages":{"all":"Alle","mine":"Mijn","unread":"Ongelezen"},"change_password":{"success":"(e-mail verzonden)","in_progress":"(e-mail wordt verzonden)","error":"(fout)","action":"Stuur wachtwoord-reset-mail","set_password":"Stel wachtwoord in"},"change_about":{"title":"Wijzig bio","error":"Het veranderen van deze waarde is mislukt."},"change_username":{"title":"Wijzig gebruikersnaam","confirm":"Het wijzigen van je gebruikersnaam kan consequenties hebben. Weet je zeker dat je dit wil doen?","taken":"Sorry, maar die gebruikersnaam is al in gebruik.","error":"Het wijzigen van je gebruikersnaam is mislukt.","invalid":"Die gebruikersnaam is ongeldig. Gebruik alleen nummers en letters."},"change_email":{"title":"Wijzig e-mail","taken":"Sorry, dat e-mailadres is niet beschikbaar.","error":"Het veranderen van je e-mailadres is mislukt. Misschien is deze al in gebruik?","success":"We hebben een mail gestuurd naar dat adres. Volg de bevestigingsinstructies in die mail."},"change_avatar":{"title":"Wijzig je profielafbeelding","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, gebaseerd op","gravatar_title":"Verander je avatar op de Gravatar website","refresh_gravatar_title":"Laad je Gravatar opnieuw","letter_based":"Door systeem toegekende profielafbeelding","uploaded_avatar":"Eigen afbeelding","uploaded_avatar_empty":"Voeg een eigen afbeelding toe","upload_title":"Upload je afbeelding","upload_picture":"Upload afbeelding","image_is_not_a_square":"Let op: we hebben je afbeelding bijgesneden; breedte en hoogte waren niet gelijk.","cache_notice":"Je hebt je profielfoto succesvol gewijzigd, maar het kan even duren voordat deze zichtbaar is wegens browser caching."},"change_profile_background":{"title":"Profielachtergrond","instructions":"Profielachtergronden worden gecentreerd en hebben een standaard breedte van 850px."},"change_card_background":{"title":"Achtergrond gebruikersprofiel","instructions":"Achtergrondafbeeldingen worden gecentreerd en hebben een standaard breedte van 590px."},"email":{"title":"E-mail","instructions":"Nooit publiekelijk vertonen","ok":"We sturen een e-mail ter bevestiging","invalid":"Vul een geldig e-mailadres in ","authenticated":"Je e-mail is geauthenticeerd door  {{provider}}"},"name":{"title":"Naam","instructions":"Je volledige naam (optioneel)","instructions_required":"Je volledige naam","too_short":"Je naam is te kort","ok":"Je naam ziet er goed uit"},"username":{"title":"Gebruikersnaam","instructions":"Uniek, geen spaties, kort","short_instructions":"Mensen kunnen naar je verwijzen als @{{username}}.","available":"Je gebruikersnaam is beschikbaar.","global_match":"E-mail hoort bij deze gebruikersnaam","global_mismatch":"Is al geregistreerd. Gebruikersnaam {{suggestion}} proberen?","not_available":"Niet beschikbaar. Gebruikersnaam {{suggestion}} proberen?","too_short":"Je gebruikersnaam is te kort.","too_long":"Je gebruikersnaam is te lang.","checking":"Kijken of gebruikersnaam beschikbaar is...","enter_email":"Gebruikersnaam gevonden. Vul het bijbehorende e-mailadres in.","prefilled":"Je e-mailadres komt overeen met je geregistreerde gebruikersnaam."},"locale":{"title":"Interfacetaal","instructions":"De taal waarin het forum wordt getoond. Deze verandert als je de pagina herlaadt.","default":"(standaard)"},"password_confirmation":{"title":"Nogmaals het wachtwoord"},"last_posted":"Laatste bericht","last_emailed":"Laatst gemaild","last_seen":"Gezien","created":"Lid sinds","log_out":"Uitloggen","location":"Locatie","card_badge":{"title":"Badge van gebruikersprofiel"},"website":"Website","email_settings":"E-mail","email_digests":{"title":"Stuur me een mail met de laatste updates wanneer ik de site niet bezoek:","daily":"dagelijks","every_three_days":"elke drie dagen","weekly":"wekelijks","every_two_weeks":"elke twee weken"},"email_direct":"Stuur me een e-mail wanneer iemand me citeert, reageert op mijn bericht, mijn @gebruikersnaam noemt of uitnodigt voor een topic.","email_private_messages":"Ontvang een mail wanneer iemand je een bericht heeft gestuurd.","email_always":"Stuur me e-mail notificaties, zelfs als ik ben actief op de site","other_settings":"Overige","categories_settings":"Categorieën","new_topic_duration":{"label":"Beschouw topics als nieuw wanneer","not_viewed":"Ik heb ze nog niet bekeken","last_here":"aangemaakt sinds de laatste keer dat ik hier was","after_1_day":"gemaakt in de afgelopen dag","after_2_days":"gemaakt in de afgelopen 2 dagen","after_1_week":"gemaakt in de afgelopen week","after_2_weeks":"gemaakt in de afgelopen 2 weken"},"auto_track_topics":"Automatisch topics volgen die ik bezocht heb","auto_track_options":{"never":"nooit","immediately":"direct","after_30_seconds":"na 30 seconden","after_1_minute":"na 1 minuut","after_2_minutes":"na 2 minuten","after_3_minutes":"na 3 minuten","after_4_minutes":"na 4 minuten","after_5_minutes":"na 5 minuten","after_10_minutes":"na 10 minuten"},"invited":{"search":"Typ om uitnodigingen te zoeken...","title":"Uitnodigingen","user":"Uitgenodigd lid","sent":"Verzonden","none":"Er zijn geen uitstaande uitnodigingen om weer te geven.","truncated":{"one":"Tonen van de eerste uitnodiging.","other":"Tonen van de eerste {{count}} uitnodigingen."},"redeemed":"Verzilverde uitnodigingen","redeemed_tab":"Verzilverd","redeemed_tab_with_count":"Verzilverd ({{count}})","redeemed_at":"Verzilverd","pending":"Uitstaande uitnodigingen","pending_tab":"Uitstaand","pending_tab_with_count":"Uitstaand ({{count}})","topics_entered":"Topics bekeken","posts_read_count":"Berichten gelezen","expired":"Deze uitnodiging is verlopen.","rescind":"Verwijder","rescinded":"Uitnodiging verwijderd","reinvite":"Stuur uitnodiging opnieuw","reinvited":"Uitnodiging opnieuw verstuurd","time_read":"Leestijd","days_visited":"Dagen bezocht","account_age_days":"leeftijd van account in dagen","create":"Stuur een uitnodiging","generate_link":"Kopieer Uitnodiging Link","generated_link_message":"\u003cp\u003eUitnodiging link succesvol aangemaakt!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eUitnodiging link is alleen geldig voor dit e-mail adres: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Je hebt nog niemand uitgenodigd. Je kan individueel uitnodigen of een groep mensen tegelijk door \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eeen groepsuitnodiging-bestand te uploaden\u003c/a\u003e","text":"Groepsuitnodiging via bestand","uploading":"Uploaden...","success":"Het uploaden van het bestand is gelukt, je krijgt een notificatie via een bericht als het proces afgerond is.","error":"Het uploaden van '{{filename}}' is niet gelukt: {{message}}"}},"password":{"title":"Wachtwoord","too_short":"Je wachtwoord is te kort.","common":"Dat wachtwoord wordt al te vaak gebruikt.","same_as_username":"Je wachtwoord is hetzelfde als je gebruikersnaam.","same_as_email":"Je wachtwoord is hetzelfde als je e-mail.","ok":"Je wachtwoord ziet er goed uit.","instructions":"Minimaal %{count} tekens."},"associated_accounts":"Logins","ip_address":{"title":"Laatste IP-adres"},"registration_ip_address":{"title":"Registratie IP-adres"},"avatar":{"title":"Profielfoto","header_title":"profiel, berichten, favorieten en voorkeuren"},"title":{"title":"Titel"},"filters":{"all":"Alle"},"stream":{"posted_by":"Geplaatst door","sent_by":"Verzonden door","private_message":"bericht","the_topic":"de topic"}},"loading":"Laden...","errors":{"prev_page":"tijdens het laden","reasons":{"network":"Netwerkfout","server":"Serverfout","forbidden":"Toegang geweigerd","unknown":"Fout","not_found":"Pagina niet gevonden"},"desc":{"network":"Controleer je verbinding.","network_fixed":"Het lijkt er op dat het terug is","server":"Fout code: {{status}}","forbidden":"Je hebt geen toestemming om dit te bekijken.","not_found":"Oeps, de applicatie heeft geprobeerd een URL te laden die niet bestaat.","unknown":"Er is iets mis gegaan"},"buttons":{"back":"Ga terug","again":"Probeer opnieuw","fixed":"Pagina laden"}},"close":"Sluit","assets_changed_confirm":"De site is bijgewerkt. Wil je een de pagina vernieuwen om de laatste versie te laden?","logout":"Je bent uitgelogd.","refresh":"Ververs","read_only_mode":{"enabled":"Alleen-lezen modus is aangezet. Je kan de site bekijken, maar interacties werken mogelijk niet.","login_disabled":"Zolang de site in read-only modus is, kan er niet ingelogd worden."},"too_few_topics_and_posts_notice":"Laten  \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ewe de discussie starten!\u003c/a\u003e Er zijn al \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics en \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e berichten. Nieuwe bezoekers hebben conversaties nodig om te lezen en reageren.","too_few_topics_notice":"Laten  \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ewe de discussie starten!\u003c/a\u003e Er zijn al \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics en \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e berichten. Nieuwe bezoekers hebben conversaties nodig om te lezen en reageren.","too_few_posts_notice":"Laten  \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ewe de discussie starten!\u003c/a\u003e. Er zijn al \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts Nieuwe bezoekers hebben conversaties nodig om te lezen en reageren.","learn_more":"leer meer...","year":"jaar","year_desc":"topics die in de afgelopen 365 dagen gemaakt zijn","month":"maand","month_desc":"topics die in de afgelopen 30 dagen gemaakt zijn","week":"week","week_desc":"topics die in de afgelopen 7 dagen gemaakt zijn","day":"dag","first_post":"Eerste bericht","mute":"Negeer","unmute":"Tonen","last_post":"Laatste bericht","last_reply_lowercase":"laatste reactie","replies_lowercase":{"one":"reactie","other":"reacties"},"signup_cta":{"sign_up":"Aanmelden","hide_session":"Herrinner me morgen","hide_forever":"nee dankje","hidden_for_session":"Ok, ik vraag het je morgen. Je kunt altijd 'Log in' gebruiken om in te loggen.","intro":"Hey! :heart_eyes: Praat mee in deze discussie, meld je aan met een account","value_prop":"Wanneer je een account aangemaakt hebt, herinneren deze wat je gelezen hebt, zodat je direct door kan lezen vanaf waar je gestopt bent. Je krijgt ook notificaties, hier en via email, wanneer nieuwe posts gemaakt zijn. En je kan ook nog posts liken :heartbeat:"},"summary":{"enabled_description":"Je leest een samenvatting van dit topic: alleen de meeste interessante berichten zoals bepaald door de community. ","description":"Er zijn \u003cb\u003e{{count}}\u003c/b\u003e reacties.","description_time":"Er zijn \u003cb\u003e{{count}}\u003c/b\u003e reacties met een gemiddelde leestijd van \u003cb\u003e{{readingTime}} minuten\u003c/b\u003e.","enable":"Samenvatting Topic","disable":"Alle berichten"},"deleted_filter":{"enabled_description":"Dit topic bevat verwijderde berichten, die niet getoond worden.","disabled_description":"Verwijderde berichten in dit topic worden getoond.","enable":"Verberg verwijderde berichten","disable":"Toon verwijderde berichten"},"private_message_info":{"title":"Bericht","invite":"Nodig anderen uit...","remove_allowed_user":"Weet je zeker dat je {{naam}} wilt verwijderen uit dit bericht?"},"email":"E-mail","username":"Gebruikersnaam","last_seen":"Gezien","created":"Gemaakt","created_lowercase":"gemaakt","trust_level":"Trustlevel","search_hint":"gebruikersnaam, e-mail of IP-adres","create_account":{"title":"Maak een nieuw account","failed":"Er ging iets mis, wellicht is het e-mailadres al geregistreerd. Probeer de 'Wachtwoord vergeten'-link."},"forgot_password":{"title":"Wachtwoord herstellen","action":"Ik ben mijn wachtwoord vergeten","invite":"Vul je gebruikersnaam of e-mailadres in en we sturen je een wachtwoord-herstel-mail.","reset":"Herstel wachtwoord","complete_username":"Als er een account gevonden kan worden met de gebruikersnaam \u003cb\u003e%{username}\u003cb/\u003e, dan zal je spoedig een e-mail ontvangen met daarin instructies om je wachtwoord te resetten.","complete_email":"Als er een account gevonden kan worden met het e-mailadres \u003cb\u003e%{email}\u003cb/\u003e, dan zal je spoedig een e-mail ontvangen met daarin instructies om je wachtwoord te resetten.","complete_username_found":"We hebben een account met de gebruikersnaam \u003cb\u003e%{username}\u003c/b\u003e gevonden. Je zal spoedig een e-mail ontvangen met daarin instructies om je wachtwoord te resetten.","complete_email_found":"We hebben een account gevonden met het emailadres \u003cb\u003e%{email}\u003cb/\u003e. Je zal spoedig een e-mail ontvangen met daarin instructies om je wachtwoord te resetten.","complete_username_not_found":"Geen account met de gebruikersnaam \u003cb\u003e%{username}\u003c/b\u003e gevonden","complete_email_not_found":"Geen account met het e-mailadres \u003cb\u003e%{email}\u003c/b\u003e gevonden"},"login":{"title":"Inloggen","username":"Gebruiker","password":"Wachtwoord","email_placeholder":"e-mail of gebruikersnaam","caps_lock_warning":"Caps Lock staat aan","error":"Er is een onbekende fout opgetreden","rate_limit":"Wacht even voor je opnieuw probeert in te loggen.","blank_username_or_password":"Vul je email of gebruikersnaam en je wachtwoord in.","reset_password":"Herstel wachtwoord","logging_in":"Inloggen...","or":"Of","authenticating":"Authenticatie...","awaiting_confirmation":"Je account is nog niet geactiveerd. Gebruik de 'Wachtwoord vergeten'-link om een nieuwe activatiemail te ontvangen.","awaiting_approval":"Je account is nog niet goedgekeurd door iemand van de staf. Je krijgt van ons een mail wanneer dat gebeurd is.","requires_invite":"Toegang tot dit forum is alleen op uitnodiging.","not_activated":"Je kan nog niet inloggen. We hebben je een activatie-mail gestuurd (naar \u003cb\u003e{{sentTo}}\u003c/b\u003e). Volg de instructies in die mail om je account te activeren.","not_allowed_from_ip_address":"Je kunt niet inloggen vanaf dat IP-adres.","admin_not_allowed_from_ip_address":"Je kan jezelf niet aanmelden vanaf dat IP-adres.","resend_activation_email":"Klik hier om de activatiemail opnieuw te ontvangen.","sent_activation_email_again":"We hebben een nieuwe activatiemail gestuurd naar \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Het kan een aantal minuten duren voor deze aan komt. Check ook je spamfolder.","to_continue":"Log a.u.b. in","preferences":"Je moet ingelogd zijn om je gebruikersinstellingen te wijzigen.","forgot":"Ik kan me de details van mijn gebruikersaccount niet herinneren.","google":{"title":"met Google","message":"Inloggen met een Google-account (zorg ervoor dat je popup blocker uit staat)"},"google_oauth2":{"title":"met Google","message":"Authenticeren met Google (zorg er voor dat pop-up blockers uit staan)"},"twitter":{"title":"met Twitter","message":"Inloggen met een Twitteraccount (zorg ervoor dat je popup blocker uit staat)"},"facebook":{"title":"met Facebook","message":"Inloggen met een Facebookaccount (zorg ervoor dat je popup blocker uit staat)"},"yahoo":{"title":"met Yahoo","message":"Inloggen met een Yahoo-account (zorg ervoor dat je popup blocker uit staat)"},"github":{"title":"met Github","message":"Inloggen met een Githubaccount (zorg ervoor dat je popup blocker uit staat)"}},"apple_international":"Apple/Internationaal","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"meer...","options":"Opties","whisper":"Fluister","add_warning":"Dit is een officiële waarschuwing.","toggle_whisper":"Schakel Fluistermode","posting_not_on_topic":"In welke topic wil je je antwoord plaatsen?","saving_draft_tip":"opslaan...","saved_draft_tip":"opgeslagen","saved_local_draft_tip":"lokaal opgeslagen","similar_topics":"Jouw topic lijkt op...","drafts_offline":"concepten offline","error":{"title_missing":"Titel is verplicht","title_too_short":"Titel moet uit minstens {{min}} tekens bestaan","title_too_long":"Titel kan niet langer dan {{max}} tekens zijn","post_missing":"Bericht kan niet leeg zijn","post_length":"Bericht moet ten minste {{min}} tekens bevatten","try_like":"Heb je de \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e-knop geprobeerd?","category_missing":"Je moet nog een categorie kiezen"},"save_edit":"Bewaar wijzigingen","reply_original":"Reageer op oorspronkelijke topic","reply_here":"Reageer hier","reply":"Reageer","cancel":"Annuleer","create_topic":"Maak topic","create_pm":"Bericht","title":"Of druk op Ctrl-Return","users_placeholder":"Voeg een lid toe","title_placeholder":"Waar gaat de discussie over in één korte zin?","edit_reason_placeholder":"vanwaar de wijziging?","show_edit_reason":"(geef een reden)","reply_placeholder":"Typ hier. Gebruik Markdown, BBCode, of HTML om op te maken. Sleep of plak afbeeldingen.","view_new_post":"Bekijk je nieuwe bericht.","saving":"Opslaan","saved":"Opgeslagen!","saved_draft":"Bezig met conceptbericht. Selecteer om door te gaan.","uploading":"Uploaden...","show_preview":"toon voorbeeld \u0026raquo;","hide_preview":"\u0026laquo; verberg voorbeeld","quote_post_title":"Citeer hele bericht","bold_title":"Vet","bold_text":"Vetgedrukte tekst","italic_title":"Cursief","italic_text":"Cursieve tekst","link_title":"Weblink","link_description":"geef hier een omschrijving","link_dialog_title":"Voeg weblink toe","link_optional_text":"optionele titel","link_placeholder":"http://example.com \"optional text\"","quote_title":"Citaat","quote_text":"Citaat","code_title":"Opgemaakte tekst","code_text":"zet 4 spaties voor opgemaakte tekst","upload_title":"Afbeelding","upload_description":"geef een omschrijving voor de afbeelding op","olist_title":"Genummerde lijst","ulist_title":"Lijst met bullets","list_item":"Lijstonderdeel","heading_title":"Kop","heading_text":"Kop","hr_title":"Horizontale lijn","help":"Uitleg over Markdown","toggler":"verberg of toon de editor","modal_ok":"OK","modal_cancel":"Annuleer","admin_options_title":"Optionele stafinstellingen voor deze topic","auto_close":{"label":"Tijd waarna topic automatisch wordt gesloten:","error":"Vul een geldige waarde in.","based_on_last_post":"Sluit pas als het laatste bericht in het topic op zijn minst zo oud is.","all":{"examples":"Voor het aantal uur (24), absolute tijd (17:30) of timestamp (2013-11-22 14:00) in."},"limited":{"units":"(# aantal uren)","examples":"Geef aantal uren (24)."}}},"notifications":{"title":"notificaties van @naam vermeldingen, reacties op je berichten en topics, berichten, etc.","none":"Notificaties kunnen niet geladen worden.","more":"bekijk oudere notificaties","total_flagged":"aantal gemarkeerde berichten","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='geciteerd' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='beantwoord' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='beantwoord' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='aangepast' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='geliked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='privebericht' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='privebericht' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='heeft jouw uitnodiging geaccepteerd' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e heeft jouw uitnodiging geaccepteerd\u003c/p\u003e","moved_post":"\u003ci title='heeft bericht verplaatst' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e verplaatste {{description}}\u003c/p\u003e","linked":"\u003ci title='gelinkt bericht' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge ontvangen' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e'{{description}}' ontvangen\u003c/p\u003e","alt":{"mentioned":"Genoemd door","quoted":"Gequoot door","replied":"Gereageerd","posted":"Geplaatst door","edited":"Wijzig je bericht door","liked":"Vind je bericht leuk","private_message":"Privébericht van","invited_to_private_message":"Uitgenodigd voor een privébericht van","invited_to_topic":"Uitgenodigd voor een topic door","invitee_accepted":"Uitnodiging geaccepteerd door","moved_post":"Je bericht is verplaatst door","linked":"Link naar je bericht","granted_badge":"Badge toegekend"},"popup":{"mentioned":"{{username}} heeft je genoemd in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} heeft je geciteerd in \"{{topic}}\" - {{site_title}}","replied":"{{username}} heeft je beantwoord in \"{{topic}}\" - {{site_title}}","posted":"{{username}} heeft een bericht geplaats in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} heeft je een privebericht gestuurd in \"{{topic}}\" - {{site_title}}","linked":"{{username}} heeft een link gemaakt naar jouw bericht vanuit \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Voeg een afbeelding toe","title_with_attachments":"Voeg een afbeelding of bestand toe","from_my_computer":"Vanaf mijn apparaat","from_the_web":"Vanaf het web","remote_tip":"link naar afbeelding","remote_tip_with_attachments":"link naar afbeelding of bestand {{authorized_extensions}}","local_tip":"selecteer afbeeldingen van uw apparaat","local_tip_with_attachments":"selecteer afbeeldingen of bestanden vanaf je apparaat {{authorized_extensions}}","hint":"(je kan afbeeldingen ook slepen in de editor om deze te uploaden)","hint_for_supported_browsers":"je kunt ook afbeeldingen slepen of plakken in de editor","uploading":"Uploaden","select_file":"Selecteer een bestand","image_link":"de link waar je afbeelding naar verwijst"},"search":{"sort_by":"Sorteren op","relevance":"Relevantie","latest_post":"Laatste bericht","most_viewed":"Meest bekeken","most_liked":"Meest geliked","select_all":"Selecteer Alles","clear_all":"Wis Alles","result_count":{"one":"1 resultaat voor \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} resultaat voor \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"zoek naar topics, berichten, gebruikers of categorieën","no_results":"Geen resultaten gevonden.","no_more_results":"Geen resultaten meer gevonden.","search_help":"Zoek in help","searching":"Zoeken...","post_format":"#{{post_number}} door {{username}}","context":{"user":"Zoek berichten van @{{username}}","category":"Doorzoek de \"{{category}}\" categorie","topic":"Zoek in deze topic","private_messages":"Zoek berichten"}},"hamburger_menu":"ga naar een andere topiclijst of categorie","new_item":"nieuw","go_back":"ga terug","not_logged_in_user":"gebruikerspagina met samenvatting van huidige activiteit en voorkeuren","current_user":"ga naar je gebruikerspagina","topics":{"bulk":{"unlist_topics":"Topics van lijst halen","reset_read":"markeer als ongelezen","delete":"Verwijder topics","dismiss":"Afwijzen","dismiss_read":"Alle ongelezen afwijzen","dismiss_button":"Afwijzen...","dismiss_tooltip":"Alleen nieuwe posts afwijzen of stop het volgen van topics","also_dismiss_topics":"Deze topics niet meer volgens? (Topics zullen niet meer verschijnen in het tabblad Ongelezen)","dismiss_new":"markeer nieuwe berichten als gelezen","toggle":"toggle bulkselectie van topics","actions":"Bulk Acties","change_category":"Wijzig categorie","close_topics":"Sluit topics","archive_topics":"Archiveer Topics","notification_level":"Wijzig notificatielevel","choose_new_category":"Kies de nieuwe categorie voor de topics:","selected":{"one":"Je hebt \u003cb\u003e1\u003c/b\u003e topic geselecteerd.","other":"Je hebt \u003cb\u003e{{count}}\u003c/b\u003e topics geselecteerd."}},"none":{"unread":"Je hebt geen ongelezen topics.","new":"Je hebt geen nieuwe topics.","read":"Je hebt nog geen topics gelezen.","posted":"Je hebt nog niet in een topic gereageerd.","latest":"Er zijn geen populaire topics. Dat is jammer.","hot":"Er zijn geen polulaire topics.","bookmarks":"Je hebt nog geen topics met bladwijzer.","category":"Er zijn geen topics in {{category}}.","top":"Er zijn geen top-topics.","search":"Er zijn geen zoekresultaten gevonden.","educate":{"new":"\u003cp\u003eJe nieuwe topics verschijnen hier.\u003c/p\u003e\u003cp\u003eStandaard worden topics als nieuw beschouwd en tonen een \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enieuw\u003c/span\u003e indicator als ze gemaakt zijn in de afgelopen 2 dagen.\u003c/p\u003e\u003cp\u003eJe kan dit aanpassen in je \u003ca href=\"%{userPrefsUrl}\"\u003evoorkeuren\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eJe ongelezen topics verschijnen hier.\u003c/p\u003e\u003cp\u003eStandaard worden topics als ongelezen beschouwd en tonen een ongelezen aantal \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e als je:\u003c/p\u003e\u003cul\u003e\u003cli\u003eHet topic gemaakt hebt\u003c/li\u003e\u003cli\u003eGeantwoord hebt in het topic\u003c/li\u003e\u003cli\u003eHet topic meer dan 4 minuten hebt gelezen\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOf als je het topic expliciet hebt gemarkeerd als Te Volgen via de notificatieknop onder aan de pagina van elk topic.\u003c/p\u003e\u003cp\u003eJe kan dit aanpassen in je \u003ca href=\"%{userPrefsUrl}\"\u003einstellingen\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Er zijn geen recente topics.","hot":"Er zijn geen polulaire topics meer.","posted":"Er zijn geen geplaatste topics meer.","read":"Er zijn geen gelezen topics meer.","new":"Er zijn geen nieuwe topics meer.","unread":"Er zijn geen ongelezen topics meer.","category":"Er zijn geen topics meer in {{category}}.","top":"Er zijn geen top-topics meer.","bookmarks":"Er zijn niet meer topics met een bladwijzer.","search":"Er zijn geen zoekresultaten meer."}},"topic":{"unsubscribe":{"stop_notifications":"Je zal nu minder notificaties ontvangen voor \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Je huidige notificatie status is"},"filter_to":"{{post_count}} berichten in topic","create":"Nieuw topic","create_long":"Maak een nieuw topic","private_message":"Stuur een bericht","list":"Topics","new":"nieuw topic","unread":"ongelezen","new_topics":{"one":"1 nieuwe topic","other":"{{count}} nieuwe topics"},"unread_topics":{"one":"1 ongelezen topic","other":"{{count}} ongelezen topics"},"title":"Topic","invalid_access":{"title":"Topic is privé","description":"Sorry, je hebt geen toegang tot deze topic.","login_required":"Je moet inloggen om dit topic te kunnen bekijken."},"server_error":{"title":"Laden van topic is mislukt","description":"Sorry, we konden dit topic niet laden, waarschijnlijk door een verbindingsprobleem. Probeer het later opnieuw. Als het probleem zich blijft voordoen, laat het ons dan weten."},"not_found":{"title":"Topic niet gevonden","description":"Sorry, we konden het opgevraagde topic niet vinden. Wellicht is het verwijderd door een moderator?"},"total_unread_posts":{"one":"je hebt 1 ongelezen bericht in deze discussie","other":"je hebt {{count}} ongelezen berichten in dit topic"},"unread_posts":{"one":"je hebt 1 ongelezen bericht in deze topic","other":"je hebt {{count}} ongelezen berichten in deze topic"},"new_posts":{"one":"er is 1 nieuw bericht in deze topic sinds je deze voor het laatst gelezen hebt","other":"er zijn {{count}} nieuwe berichten in deze topic sinds je deze voor het laatst gelezen hebt"},"likes":{"one":"er is één waardering in deze topic","other":"er zijn {{likes}} waarderingen in deze topic"},"back_to_list":"Terug naar topiclijst","options":"Topic-opties","show_links":"laat links in deze topic zien","toggle_information":"Zet topic details aan/uit","read_more_in_category":"Wil je meer lezen? Kijk dan voor andere topics in {{catLink}} of {{latestLink}}.","read_more":"Wil je meer lezen? {{catLink}} of {{latestLink}}.","browse_all_categories":"Bekijk alle categorieën","view_latest_topics":"bekijk nieuwste topics","suggest_create_topic":"Wil je een nieuwe topic schrijven?","jump_reply_up":"ga naar een eerdere reactie","jump_reply_down":"ga naar een latere reactie","deleted":"Deze topic is verwijderd","auto_close_notice":"Deze topic wordt automatisch over %{timeLeft} gesloten.","auto_close_notice_based_on_last_post":"Deze topic sluit %{duration} na de laatste reactie.","auto_close_title":"Instellingen voor automatisch sluiten","auto_close_save":"Opslaan","auto_close_remove":"Sluit deze topic niet automatisch","progress":{"title":"voortgang van topic","go_top":"bovenaan","go_bottom":"onderkant","go":"ga","jump_bottom":"spring naar laatste bericht","jump_bottom_with_number":"spring naar bericht %{post_number}","total":"totaal aantal berichten","current":"huidige bericht","position":"bericht %{current} van %{total}"},"notifications":{"reasons":{"3_6":"Je ontvangt notificaties omdat je deze categorie in de gaten houdt.","3_5":"Je ontvangt notificaties omdat je deze topic automatisch in de gaten houdt.","3_2":"Je ontvangt notificaties omdat je dit topic in de gaten houdt.","3_1":"Je ontvangt notificaties omdat je dit topic hebt gemaakt.","3":"Je ontvangt notificaties omdat je dit topic in de gaten houdt.","2_8":"Je ontvangt notificaties omdat je deze categorie volgt.","2_4":"Je ontvangt notificaties omdat je een reactie in dit topic hebt geplaatst.","2_2":"Je ontvangt notificaties omdat je dit topic volgt.","2":"Je ontvangt notificaties omdat je \u003ca href=\"/users/{{username}}/preferences\"\u003edit topic hebt gelezen\u003c/a\u003e.","1_2":"Je krijgt een notificatie als iemand je @naam noemt of reageert op een bericht van jou.","1":"Je krijgt een notificatie als iemand je @naam noemt of reageert op een bericht van jou.","0_7":"Je negeert alle notificaties in deze categorie.","0_2":"Je negeert alle notificaties in deze topic.","0":"Je negeert alle notificaties in deze topic."},"watching_pm":{"title":"In de gaten houden","description":"Je krijgt een notificatie voor elke nieuwe reactie op dit bericht, en het aantal nieuwe reacties wordt weergegeven."},"watching":{"title":"In de gaten houden","description":"Je krijgt een notificatie voor elke nieuwe reactie op dit bericht, en het aantal nieuwe reacties wordt weergegeven."},"tracking_pm":{"title":"Volgen","description":"Het aantal nieuwe reacties op dit bericht wordt weergegeven. Je krijgt een notificatie als iemand je @name noemt of reageert."},"tracking":{"title":"Volgen","description":"Het aantal nieuwe reacties op dit bericht wordt weergegeven. Je krijgt een notificatie als iemand je @name noemt of reageert."},"regular":{"title":"Normaal","description":"Je krijgt een notificatie als iemand je @naam noemt of reageert op een bericht van jou."},"regular_pm":{"title":"Normaal","description":"Je krijgt een notificatie als iemand je @naam noemt of reageert op een bericht van jou."},"muted_pm":{"title":"Negeren","description":"Je zal geen enkele notificatie ontvangen over dit bericht."},"muted":{"title":"Negeren","description":"Je zult nooit op de hoogte worden gebracht over dit topic, en het zal niet verschijnen in Nieuwste."}},"actions":{"recover":"Herstel topic","delete":"Verwijder topic","open":"Open topic","close":"Sluit topic","multi_select":"Selecteer berichten...","auto_close":"Automatisch sluiten...","pin":"Pin topic...","unpin":"Ontpin topic...","unarchive":"De-archiveer topic","archive":"Archiveer topic","invisible":"Maak onzichtbaar","visible":"Maak zichtbaar","reset_read":"Reset leesdata"},"feature":{"pin":"Pin topic","unpin":"Ontpin topic","pin_globally":"Pin topic globaal vast","make_banner":"Banner Topic","remove_banner":"Verwijder Banner Topic"},"reply":{"title":"Reageer","help":"Schrijf een reactie op deze topic"},"clear_pin":{"title":"Verwijder pin","help":"Verwijder de gepinde status van deze topic, zodat het niet langer bovenaan je topiclijst verschijnt."},"share":{"title":"Deel","help":"deel een link naar deze topic"},"flag_topic":{"title":"Markeer","help":"geef een privé-markering aan dit topic of stuur er een privé-bericht over","success_message":"Je hebt dit topic gemarkeerd"},"feature_topic":{"title":"Feature dit topic","pin":"Zet deze topic bovenaan in de {{categoryLink}} categorie tot","confirm_pin":"Je hebt al {{count}} vastgepinde topics. Teveel vastgepinde topics kunnen storend zijn voor nieuwe en anonieme gebruikers. Weet je zeker dat je nog een topic wilt vastpinnen in deze categorie?","unpin":"Zorg ervoor dat dit topic niet langer bovenaan de {{categoryLink}} categorie komt.","unpin_until":"Zet deze topic niet langer bovenaan in de {{categoryLink}} categorie of wacht tot \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Gebruikers kunnen het vastpinnen voor dit topic voor zichzelf ongedaan maken.","pin_validation":"Een datum is vereist om deze topic vast te pinnen.","pin_globally":"Zet deze topic bovenaan in alle topic lijsten tot","confirm_pin_globally":"Je hebt al {{count}} globaal vastgepinde topics. Teveel vastgepinde topics kunnen storend zijn voor nieuwe en anonieme gebruikers. Weet je zeker dat je nog een topic globaal wilt vastpinnen?","unpin_globally":"Zorg ervoor dat dit topic niet langer bovenaan alle topic lijsten komt.","unpin_globally_until":"Zet deze topic niet langer bovenaan in alle topic lijsten of wacht tot \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Gebruikers kunnen dit topic voor zichzelf ontpinnen.","make_banner":"Zorg ervoor dat dit topic een banner wordt welke bovenaan alle pagina's komt.","remove_banner":"Verwijder de banner die bovenaan alle pagina's staat.","banner_note":"Gebruikers kunnen de banner negeren door deze te sluiten. Er kan maar een topic gebannered zijn."},"inviting":"Uitnodigen...","automatically_add_to_groups_optional":"Deze uitnodiging geeft ook toegang tot de volgende groepen: (optioneel, alleen voor beheerders)","automatically_add_to_groups_required":"Deze uitnodiging geeft ook toegang tot de volgende groepen: (\u003cb\u003eVerplicht\u003c/b\u003e, alleen voor beheerders)","invite_private":{"title":"Uitnodigen voor Bericht","email_or_username":"E-mail of gebruikersnaam van genodigde","email_or_username_placeholder":"e-mailadres of gebruikersnaam","action":"Uitnodigen","success":"Deze gebruiker is uitgenodigd om in de conversatie deel te nemen.","error":"Sorry, er is iets misgegaan bij het uitnodigen van deze persoon","group_name":"groepsnaam"},"invite_reply":{"title":"Uitnodigen","username_placeholder":"gebruikersnaam","action":"Stuur Uitnodiging","help":"nodig anderen uit voor dit topic via email of notificaties","to_forum":"We sturen een kort mailtje waarmee je vriend zich direct kan aanmelden door op een link te klikken, zonder te hoeven inloggen.","sso_enabled":"Voer de gebruikersnaam in van de persoon die je uit wil nodigen voor dit topic.","to_topic_blank":"Voer de gebruikersnaam of het email-adres in van de persoon die je uit wil nodigen voor dit topic.","to_topic_email":"Je hebt een email-adres ingevuld. We zullen een uitnodiging e-mailen waarmee je vriend direct kan antwoorden op dit topic.","to_topic_username":"Je hebt een gebruikersnaam ingevuld. We sturen een notificatie met een link om deel te nemen aan dit topic.","to_username":"Vul de gebruikersnaam in van de persoon die je wilt uitnodigen. We sturen een notificatie met een link om deel te nemen aan dit topic","email_placeholder":"naam@voorbeeld.nl","success_email":"We hebben een uitnodiging gemaild naar  \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. We stellen je op de hoogte als op de uitnodiging is ingegaan. Controleer de uitnodigingen tab op je gebruikerspagina om een overzicht te hebben van je uitnodigingen.","success_username":"We hebben die gebruiker uitgenodigd om deel te nemen in dit topic.","error":"Sorry, we konden deze persoon niet uitnodigen. Wellicht is deze al een keer uitgenodigd? (Uitnodigingen worden gelimiteerd)"},"login_reply":"Log in om te beantwoorden","filters":{"n_posts":{"one":"één bericht","other":"{{count}} berichten"},"cancel":"Verwijder filter"},"split_topic":{"title":"Verplaats naar nieuwe topic","action":"verplaats naar nieuwe topic","topic_name":"Naam nieuwe topic","error":"Er ging iets mis bij het verplaatsen van berichten naar de nieuwe topic.","instructions":{"one":"Je staat op het punt een nieuwe topic aan te maken en het te vullen met het bericht dat je geselecteerd hebt.","other":"Je staat op het punt een nieuwe topic aan te maken en het te vullen met de \u003cb\u003e{{count}}\u003c/b\u003e berichten die je geselecteerd hebt."}},"merge_topic":{"title":"Verplaats naar bestaande topic","action":"verplaats naar bestaande topic","error":"Er ging iets mis bij het verplaatsen van berichten naar die topic.","instructions":{"one":"Selecteer de topic waarnaar je het bericht wil verplaatsen.","other":"Selecteer de topic waarnaar je de \u003cb\u003e{{count}}\u003c/b\u003e berichten wil verplaatsen."}},"change_owner":{"title":"Wijzig eigenaar van berichten","action":"verander van eigenaar","error":"Er ging iets mis bij het veranderen van eigendom van dat bericht.","label":"Nieuwe eigenaar van berichten","placeholder":"gebruikersnaam van de nieuwe eigenaar","instructions":{"one":"Kies de nieuwe eigenaar van het bericht door \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Kies de nieuwe eigenaar van de {{count}} berichten door \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Let op dat alle meldingen over deze discussie niet met terugwerkende kracht worden overgedragen aan de nieuwe gebruiker. \u003cbr\u003eWaarschuwing: Momenteel wordt geen bericht-afhankelijke gegevens overgedragen aan de nieuwe gebruiker. Wees voorzichtig met het gebruik hier van."},"change_timestamp":{"title":"Wijzig Tijdsaanduiding","action":"wijzig tijdsaanduiding","invalid_timestamp":"Tijdsaanduiding kan niet in de toekomst zijn","error":"Het wijzigen van de tijdsaanduiding van de topic is niet gelukt.","instructions":"Kies een nieuwe tijdsaanduiding voor de topic. Berichten in de topic worden aangepast zodat het onderlinge tijdsverschil gelijk blijft."},"multi_select":{"select":"selecteer","selected":"geselecteerd ({{count}})","select_replies":"selecteer +antwoorden","delete":"verwijder geselecteerde berichten","cancel":"annuleer selectie","select_all":"selecteer alles","deselect_all":"deselecteer alles","description":{"one":"Je hebt \u003cb\u003eéén\u003c/b\u003e bericht geselecteerd.","other":"Je hebt \u003cb\u003e{{count}}\u003c/b\u003e berichten geselecteerd."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"citeer","edit":"Bewerken van {{link}} door {{replyAvatar}} {{username}}","edit_reason":"Reden: ","post_number":"bericht {{number}}","last_edited_on":"bericht gewijzig op","reply_as_new_topic":"Reageer als gelinkt topic","continue_discussion":"Voortzetting van de discussie {{postLink}}:","follow_quote":"ga naar het geciteerde bericht","show_full":"Bekijk hele bericht","show_hidden":"Bekijk verborgen inhoud","deleted_by_author":{"one":"(bericht ingetrokken door de schrijver), wordt automatisch verwijderd over %{count} uur, tenzij gemarkeerd.","other":"(bericht ingetrokken door de schrijver, wordt automatisch verwijderd over %{count} uur, tenzij gemarkeerd)"},"expand_collapse":"in-/uitvouwen","gap":{"one":"bekijk 1 verborgen reactie","other":"bekijk {{count}} verborgen reacties"},"more_links":"{{count}} meer...","unread":"Bericht is ongelezen","has_replies":{"one":"1 Reactie","other":"{{count}} Reacties"},"has_likes":{"one":"1 Like","other":"{{count}} Likes"},"has_likes_title":{"one":"iemand vind dit bericht leuk","other":"{{count}} mensen vinden dit bericht leuk"},"errors":{"create":"Sorry, er is iets misgegaan bij het plaatsen van je bericht. Probeer het nog eens.","edit":"Sorry, er is iets misgegaan bij het bewerken van je bericht. Probeer het nog eens.","upload":"Sorry, er is iets misgegaan bij het uploaden van je bestand. Probeer het nog eens.","attachment_too_large":"Sorry, het bestand dat je wil uploaden is te groot (maximum grootte is {{max_size_kb}}kb).","file_too_large":"Sorry, het bestand dat je probeert te uploaden is te groot (maximum grootte is {{max_size_kb}}kb).","too_many_uploads":"Sorry, je kan maar één afbeelding tegelijk uploaden.","too_many_dragged_and_dropped_files":"Sorry, je kan maar 10 bestanden tegelijk verslepen.","upload_not_authorized":"Sorry, je mag dat type bestand niet uploaden (toegestane extensies: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Sorry, nieuwe gebruikers mogen nog geen afbeeldingen uploaden.","attachment_upload_not_allowed_for_new_user":"Sorry, nieuwe gebruikers mogen nog geen bestanden uploaden.","attachment_download_requires_login":"Sorry, maar je moet ingelogd zijn om bijlages te downloaden."},"abandon":{"confirm":"Weet je zeker dat je dit bericht wil afbreken?","no_value":"Nee, behouden","yes_value":"Ja, verwijderen"},"via_email":"dit bericht kwam binnen via e-mail","whisper":"deze posts zijn alleen toegankelijk voor moderators","wiki":{"about":"deze discussie is een wiki; normale gebruikers kunnen hem aanpassen"},"archetypes":{"save":"Bewaar instellingen"},"controls":{"reply":"reageer op dit bericht","like":"vind dit bericht leuk","has_liked":"Je vind dit bericht leuk","undo_like":"like ongedaan maken","edit":"bewerk dit bericht","edit_anonymous":"Sorry, maar je moet ingelogd zijn om dit bericht aan te kunnen passen.","flag":"meld dit bericht of stuur er een notificatie over (alleen zichtbaar voor moderatoren en admins)","delete":"verwijder dit bericht","undelete":"herstel dit bericht","share":"deel een link naar dit bericht","more":"Meer","delete_replies":{"confirm":{"one":"Wil je ook het directe antwoord op dit bericht verwijderen?","other":"Wil je ook de {{count}} directe antwoorden op dit bericht verwijderen?"},"yes_value":"Ja, verwijder deze antwoorden ook","no_value":"Nee, alleen dit bericht"},"admin":"adminacties voor bericht","wiki":"Maak Wiki","unwiki":"Verwijder Wiki","convert_to_moderator":"Voeg stafkleur toe","revert_to_regular":"Verwijder stafkleur","rebake":"Maak HTML opnieuw","unhide":"Toon","change_owner":"Eigenaar wijzigen "},"actions":{"flag":"Markeer","defer_flags":{"one":"Markering negeren","other":"Markeringen negeren"},"it_too":{"off_topic":"Markeer het ook","spam":"Markeer het ook","inappropriate":"Markeer deze ook","custom_flag":"Markeer het ook","bookmark":"Zet het ook in je bladwijzers","like":"Vind het ook leuk","vote":"Stem ook"},"undo":{"off_topic":"Verwijder markering","spam":"Verwijder markering","inappropriate":"Hef markering op","bookmark":"Verwijder uit je bladwijzers","like":"Vind het niet meer leuk","vote":"Stem niet meer"},"people":{"off_topic":"{{icons}} markeerden dit als off-topic","spam":"{{icons}} markeerden dit als spam","spam_with_url":"{{icons}} markeerde \u003ca href='{{postUrl}}'\u003edit als spam\u003c/a\u003e","inappropriate":"{{icons}} markeerden dit als ongepast","notify_moderators":"{{icons}} lichtte moderators in","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003elichtte moderators in\u003c/a\u003e","notify_user":"{{icons}} verstuurde een bericht","notify_user_with_url":"{{icons}} verstuurde een \u003ca href='{{postUrl}}'\u003ebericht\u003c/a\u003e","bookmark":"{{icons}} voegden dit toe aan hun bladwijzers","like":"{{icons}} vinden dit leuk","vote":"{{icons}} hebben hier op gestemd"},"by_you":{"off_topic":"Jij markeerde dit als off-topic","spam":"Jij markeerde dit als spam","inappropriate":"Jij markeerde dit als ongepast","notify_moderators":"Jij markeerde dit voor moderatie","notify_user":"Je hebt een bericht gestuurd naar deze gebruiker","bookmark":"Jij voegde dit bericht toe aan je bladwijzers","like":"Jij vindt dit leuk","vote":"Jij hebt op dit bericht gestemd"},"by_you_and_others":{"off_topic":{"one":"Jij en iemand anders markeerden dit als off-topic","other":"Jij en {{count}} anderen markeerden dit als off-topic"},"spam":{"one":"Jij en iemand anders markeerden dit als spam","other":"Jij en {{count}} anderen markeerden dit als spam"},"inappropriate":{"one":"Jij en iemand anders markeerden dit als ongepast","other":"Jij en {{count}} anderen markeerden dit als ongepast"},"notify_moderators":{"one":"Jij en iemand anders markeerden dit voor moderatie","other":"Jij en {{count}} anderen markeerden dit voor moderatie"},"notify_user":{"one":"Jij en 1 andere stuurde een bericht naar deze gebruiker","other":"Jij en {{count}} anderen stuurden een bericht naar deze gebruiker"},"bookmark":{"one":"Jij en iemand anders voegden dit bericht toe aan de favorieten","other":"Jij en {{count}} anderen voegden dit bericht toe aan hun bladwijzers"},"like":{"one":"Jij en iemand anders vinden dit leuk","other":"Jij en {{count}} anderen vinden dit leuk"},"vote":{"one":"Jij en iemand anders hebben op dit bericht gestemd","other":"Jij en {{count}} anderen hebben op dit bericht gestemd"}},"by_others":{"off_topic":{"one":"Iemand heeft dit bericht gemarkeerd als off-topic","other":"{{count}} Mensen hebben dit bericht gemarkeerd als off-topic"},"spam":{"one":"Iemand heeft dit bericht gemarkeerd als spam","other":"{{count}} Mensen hebben dit bericht gemarkeerd als spam"},"inappropriate":{"one":"Iemand heeft dit bericht gemarkeerd als ongepast ","other":"{{count}} Mensen hebben dit bericht gemarkeerd als ongepast"},"notify_moderators":{"one":"Iemand heeft dit bericht gemarkeerd voor moderatie","other":"{{count}} Mensen hebben dit bericht gemarkeerd voor moderatie"},"notify_user":{"one":"1 persoon stuurde een bericht naar deze gebruiker","other":"{{count}} stuurden een bericht naar deze gebruiker"},"bookmark":{"one":"Iemand heeft dit bericht toegevoegd aan zijn favorieten","other":"{{count}} mensen hebben dit bericht toegevoegd aan hun bladwijzers"},"like":{"one":"iemand vindt dit leuk","other":"{{count}} mensen vinden dit leuk"},"vote":{"one":"Iemand heeft op dit bericht gestemd","other":"{{count}} Mensen hebben op dit bericht gestemd"}}},"delete":{"confirm":{"one":"Weet je zeker dat je dit bericht wil verwijderen?","other":"Weet je zeker dat je al deze berichten wil verwijderen?"}},"revisions":{"controls":{"first":"Eerste revisie","previous":"Vorige revisie","next":"Volgende revisie","last":"Laatste revisie","hide":"Verberg revisie","show":"Toon revisie","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Toon de het gerenderde bericht met wijzigingen als één geheel","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Toon de wijzigingen in het gerenderde bericht naast elkaar","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Bekijk de bron verschillen naast elkaar","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Bron"}}}},"category":{"can":"kan...","none":"(geen categorie)","all":"Alle categorieën","choose":"Selecteer een categorie\u0026hellip;","edit":"bewerk","edit_long":"Wijzig","view":"Bekijk topics in categorie","general":"Algemeen","settings":"Instellingen","topic_template":"Template voor Topic","delete":"Verwijder categorie","create":"Nieuwe categorie","create_long":"Maak categorie aan","save":"Bewaar categorie","slug":"Gestandaardiseerde Naam Categorie","slug_placeholder":"(Optioneel) woorden-met-koppelteken-verbinden voor url","creation_error":"Er ging bij het maken van de categorie iets mis.","save_error":"Er ging iets mis bij het opslaan van de categorie.","name":"Naam categorie","description":"Omschrijving","topic":"Onderwerp van de categorie","logo":"Category logo afbeelding","background_image":"Categorie achtergrondafbeelding","badge_colors":"Badgekleuren","background_color":"Achtergrondkleur","foreground_color":"Voorgrondkleur","name_placeholder":"Maximaal een of twee woorden","color_placeholder":"Kan elke webkleur zijn","delete_confirm":"Weet je zeker dat je deze categorie wil verwijderen?","delete_error":"Er ging iets mis bij het verwijderen van deze categorie","list":"Lijst van categorieën","no_description":"Voeg een beschrijving toe voor deze categorie","change_in_category_topic":"Wijzig omschrijving","already_used":"Deze kleur is al in gebruik door een andere categorie","security":"Beveiliging","special_warning":"Waarschuwing: Dee catogorie is een vooringestelde categorie en de beveiligingsinstellingen kunnen hierdoor niet bewerkt worden. Als u deze categorie niet wenst te gebruiken, verwijder deze of herbestem deze.","images":"Afbeeldingen","auto_close_label":"Sluit topics automatisch na:","auto_close_units":"uren","email_in":"Adres voor inkomende mail:","email_in_allow_strangers":"Accepteer mails van anonieme gebruikers zonder account","email_in_disabled":"Het plaatsen van nieuwe discussies via e-mail is uitgeschakeld in de Site Instellingen. Om het plaatsen van nieuwe discussie via e-mail aan te zetten,","email_in_disabled_click":"schakel \"e-mail in\" instelling in.","suppress_from_homepage":"Negeer deze categorie op de homepage","allow_badges_label":"Laat badges toekennen voor deze categorie","edit_permissions":"Wijzig permissies","add_permission":"Nieuwe permissie","this_year":"dit jaar","position":"positie","default_position":"Standaard positie","position_disabled":"Categorieën worden getoond op volgorde van activiteit. Om de volgorde van categorieën in lijst aan te passen,","position_disabled_click":"schakel \"vaste categorie posities\" in.","parent":"Bovenliggende categorie","notifications":{"watching":{"title":"In de gaten houden","description":"Je krijgt automatisch alle nieuwe topics in deze categorie te zien. Je ontvangt notificaties bij nieuwe berichten en topics, naast het topic wordt het aantal nieuwe berichten weergegeven. "},"tracking":{"title":"Volgen","description":"Je ziet automatisch alle nieuwe topics in deze categorieën. Je ontvangt notificaties wanneer iemand je @name noemt of reageert op jou."},"regular":{"title":"Normaal","description":"Je krijgt een notificatie als iemand je @naam noemt of reageert op een bericht van jou."},"muted":{"title":"Genegeerd","description":"Je zult nooit op de hoogte worden gebracht over nieuwe topics in deze categorie, en ze zullen niet verschijnen in Nieuwste."}}},"flagging":{"title":"Bedankt voor het helpen beleefd houden van onze gemeenschap!","private_reminder":"vlaggen zijn privé, \u003cb\u003ealleen\u003c/b\u003e zichtbaar voor de staf","action":"Meld bericht","take_action":"Onderneem actie","notify_action":"Bericht","delete_spammer":"Verwijder spammer","delete_confirm":"Je gaat nu \u003cb\u003e%{posts}\u003c/b\u003e berichten en \u003cb\u003e%{topics}\u003c/b\u003e van deze gebruiker verwijderen, hun account verwijderen, nieuwe aanmeldingen vanaf hun IP-adres \u003cb\u003e%{ip_address}\u003c/b\u003e blokkeren en hun e-mailadres \u003cb\u003e%{email}\u003c/b\u003e op een permanente blokkeerlijst zetten. Weet je zeker dat dit een spammer is?","yes_delete_spammer":"Ja, verwijder spammer","ip_address_missing":"(N.V.T.)","hidden_email_address":"(verborgen)","submit_tooltip":"Verstuur de privé markering","take_action_tooltip":"Bereik de vlag drempel direct, in plaats van het wachten op meer gemeenschapsvlaggen","cant":"Sorry, je kan dit bericht momenteel niet melden.","formatted_name":{"off_topic":"Het is off topic","inappropriate":"Het is ongepast","spam":"Dit is spam"},"custom_placeholder_notify_user":"Wees specifiek, opbouwend en blijf altijd beleefd.","custom_placeholder_notify_moderators":"Laat ons specifiek weten waar je je zorgen om maakt en stuur relevante links en voorbeelden mee waar mogelijk.","custom_message":{"at_least":"Gebruik ten minste {{n}} tekens","more":"Nog {{n}} te gaan...","left":"Nog {{n}}"}},"flagging_topic":{"title":"Bedankt voor het helpen beleefd houden van onze gemeenschap!","action":"Markeer topic","notify_action":"Bericht"},"topic_map":{"title":"Topicsamenvatting","participants_title":"Frequente schrijvers","links_title":"Populaire links","links_shown":"laat alle {{totalLinks}} links zien...","clicks":{"one":"1 click","other":"%{count} clicks"}},"topic_statuses":{"warning":{"help":"Dit is een officiële waarschuwing."},"bookmarked":{"help":"Je hebt een bladwijzer aan deze topic toegevoegd"},"locked":{"help":"Deze topic is gesloten; reageren is niet meer mogelijk"},"archived":{"help":"Deze topic is gearchiveerd en kan niet meer gewijzigd worden"},"locked_and_archived":{"help":"Deze topic is gesloten en gearchiveerd; reageren of wijzigen is niet langer mogelijk."},"unpinned":{"title":"Niet vastgepind","help":"Dit topic is niet langer vastgepind voor je en zal weer in de normale volgorde getoond worden"},"pinned_globally":{"title":"Globaal vastgepind","help":"Dit topic is wereldwijd gebladwijzerd; het zal worden weergegeven bovenaan Nieuwste en bij de betreffende Categorie"},"pinned":{"title":"Vastgepind","help":"Dit topic is vastgepind voor je en zal bovenaan de categorie getoond worden"},"invisible":{"help":"Dit topic is niet zichtbaar; het zal niet verschijnen in de topiclijst en kan alleen bekeken worden met een directe link"}},"posts":"Berichten","posts_lowercase":"berichten","posts_long":"er zijn {{number}} berichten in deze topic","original_post":"Originele bericht","views":"Bekeken","views_lowercase":{"one":"weergave","other":"weergaves"},"replies":"Reacties","views_long":"deze topic is {{number}} keer bekeken","activity":"Activiteit","likes":"Leuk","likes_lowercase":{"one":"like","other":"likes"},"likes_long":"er zijn {{count}} likes in deze topic","users":"Gebruikers","users_lowercase":{"one":"gebruiker","other":"gebruikers"},"category_title":"Categorie","history":"Geschiedenis","changed_by":"door {{author}}","raw_email":{"title":"Broncode van e-mail","not_available":"Niet beschikbaar"},"categories_list":"Categorielijst","filters":{"with_topics":"%{filter} topics","with_category":"%{filter} %{category} topics","latest":{"help":"topics met recente reacties"},"hot":{"title":"Populair","help":"een selectie van de meest populaire topics"},"read":{"title":"Gelezen","help":"topics die je hebt gelezen, in de volgorde wanneer je ze voor het laatst gelezen hebt"},"search":{"title":"Zoek","help":"Zoek in alle topics"},"categories":{"title":"Categorieën","title_in":"Categorie - {{categoryName}}","help":"alle topics gesorteerd op categorie"},"unread":{"help":"topics die je volgt of bijhoudt met ongelezen berichten"},"new":{"lower_title":"nieuw","help":"topics gemaakt in de afgelopen dagen"},"posted":{"title":"Mijn berichten","help":"topics waarin je een bericht hebt geplaatst"},"bookmarks":{"title":"Bladwijzers","help":"topics waar je een bladwijzer aan toe hebt gevoegd"},"category":{"help":"recente topics in de categorie {{categoryName}}"},"top":{"title":"Top","help":"de meest actieve topics van het afgelopen jaar, maand of dag","all":{"title":"Sinds het begin"},"yearly":{"title":"Jaarlijks"},"quarterly":{"title":"Per Kwartaal"},"monthly":{"title":"Maandelijks"},"weekly":{"title":"Wekelijks"},"daily":{"title":"Dagelijks"},"all_time":"Sinds het begin","this_year":"Jaar","this_quarter":"Kwartaal","this_month":"Maand","this_week":"Week","today":"Vandaag","other_periods":"bekijk eerste"}},"browser_update":"Helaas \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eis je browser te oud om te kunnen werken met deze site\u003c/a\u003e. \u003ca href=\"http://browsehappy.com\"\u003eUpgrade a.u.b. je  browser\u003c/a\u003e.","permission_types":{"full":"Maak topic / Reageer / Bekijk","create_post":"Reageer / Bekijk","readonly":"Bekijk"},"poll":{"voters":{"one":"keer gestemd","other":"keer gestemd"},"total_votes":{"one":"stem","other":"stemmen"},"average_rating":"Gemiddeld cijfer: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"U dient tenminste \u003cstrong\u003e1\u003c/strong\u003e optie te kiezen.","other":"Kies tenminste \u003cstrong\u003e%{count}\u003c/strong\u003e opties."},"up_to_max_options":{"one":"U kunt maximaal \u003cstrong\u003e1\u003c/strong\u003e optie kiezen.","other":"Je kan maximaal \u003cstrong\u003e%{count}\u003c/strong\u003e opties kiezen."},"x_options":{"one":"Je moet \u003cstrong\u003e1\u003c/strong\u003e optie kiezen.","other":"Je moet \u003cstrong\u003e%{count}\u003c/strong\u003e opties kiezen."},"between_min_and_max_options":"Je kan tussen \u003cstrong\u003e%{min}\u003c/strong\u003e en \u003cstrong\u003e%{max}\u003c/strong\u003e opties kiezen."}},"cast-votes":{"title":"Geef je stem","label":"Stem nu!"},"show-results":{"title":"Bekijk de resultaten van de poll","label":"Bekijk resultaten"},"hide-results":{"title":"Terug naar je stemmen","label":"Verberg resultaten"},"open":{"title":"Open de poll","label":"Open","confirm":"Weet je zeker dat je deze poll wil openen?"},"close":{"title":"Sluit de poll","label":"Sluit","confirm":"Weet je zeker dat je deze poll wil sluiten?"},"error_while_toggling_status":"Er ging iets mis bij het in-/uitschakelen van deze poll.","error_while_casting_votes":"Er ging iets mis bij het registreren van je stem."},"type_to_filter":"typ om te filteren...","admin":{"title":"Discourse Beheer","moderator":"Moderator","dashboard":{"title":"Dashboard","last_updated":"Dashboard laatst bijgewerkt:","version":"Versie","up_to_date":"Je bent up to date!","critical_available":"Er is een belangrijke update beschikbaar","updates_available":"Er zijn updates beschikbaar","please_upgrade":"Werk de software bij alsjeblieft","no_check_performed":"Er is nog niet op updates gecontroleerd. Zorgen dat sidekiq loopt.\"","stale_data":"Er is al een tijdje niet op updates gecontroleerd. Zorg dat sidekiq loopt.\"","version_check_pending":"Je hebt de software recentelijk bijgewerkt. Mooi!","installed_version":"Geïnstalleerd","latest_version":"Recent","problems_found":"Er zijn een aantal problemen gevonden met je Discourse-installatie:","last_checked":"Laatste check","refresh_problems":"Laad opnieuw","no_problems":"Er zijn geen problemen gevonden","moderators":"Moderators:","admins":"Admins:","blocked":"Geblokkeerd:","suspended":"Geschorst:","private_messages_short":"PB's","private_messages_title":"Berichten","mobile_title":"Mobiel","space_free":"{{size}} beschikbaar","uploads":"uploads","backups":"backups","traffic_short":"Verkeer","traffic":"Applicatie web verzoeken","page_views":"API Verzoeken","page_views_short":"API Verzoeken","show_traffic_report":"Laat gedetailleerd verkeer rapport zien","reports":{"today":"Vandaag","yesterday":"Gisteren","last_7_days":"Afgelopen 7 dagen","last_30_days":"Afgelopen 30 dagen","all_time":"Sinds het begin","7_days_ago":"7 Dagen geleden","30_days_ago":"30 Dagen geleden","all":"Alle","view_table":"tabel","view_chart":"staafgrafiek","refresh_report":"Ververs Rapport","start_date":"Start datum","end_date":"Eind datum"}},"commits":{"latest_changes":"Laatste wijzigingen: update regelmatig!","by":"door"},"flags":{"title":"Meldingen","old":"Oud","active":"Actief","agree":"Akkoord","agree_title":"Bevestig dat deze melding geldig en correct is","agree_flag_modal_title":"Akkoord en ... ","agree_flag_hide_post":"Akkoord (verberg bericht en stuur privébericht)","agree_flag_hide_post_title":"Verberg dit bericht en stuur de gebruiker automatisch een bericht met het verzoek om het aan te passen. ","agree_flag_restore_post":"Eens (herstel bericht)","agree_flag_restore_post_title":"Herstel dit bericht","agree_flag":"Akkoord met melding","agree_flag_title":"Akkoord met melding en het bericht ongewijzigd laten","defer_flag":"Negeer","defer_flag_title":"Verwijder deze melding; nu geen actie nodig","delete":"Verwijder","delete_title":"Verwijder het bericht waar deze melding naar verwijst","delete_post_defer_flag":"Verwijder bericht en negeer melding","delete_post_defer_flag_title":"Verwijder bericht; de hele topic als dit het eerste bericht is","delete_post_agree_flag":"Verwijder bericht en akkoord met melding","delete_post_agree_flag_title":"Verwijder bericht; de hele topic als dit het eerste bericht is","delete_flag_modal_title":"Verwijder en ... ","delete_spammer":"Verwijder spammer","delete_spammer_title":"Verwijder de gebruiker en al hun berichten en topics.","disagree_flag_unhide_post":"Niet akkoord (toon bericht)","disagree_flag_unhide_post_title":"Verwijder elke melding van dit bericht en maak het weer zichtbaar","disagree_flag":"Niet akkoord","disagree_flag_title":"Deze melding is ongeldig of niet correct","clear_topic_flags":"Gedaan","clear_topic_flags_title":"Het topic is onderzocht en problemen zijn opgelost. Klik op Gedaan om de meldingen te verwijderen.","more":"(meer antwoorden...)","dispositions":{"agreed":"akkoord","disagreed":"niet akkoord","deferred":"genegeerd"},"flagged_by":"Gemarkeerd door","resolved_by":"Opgelost door","took_action":"Heeft actie ondernomen","system":"Systeem","error":"Er ging iets mis","reply_message":"Reageer","no_results":"Er zijn geen markeringen","topic_flagged":"Deze \u003cstrong\u003etopic\u003c/strong\u003e is gemarkeerd.","visit_topic":"Ga naar de topic om te zien wat er aan de hand is en om actie te ondernemen","was_edited":"Bericht is gewijzigd na de eerste melding","previous_flags_count":"Dit bericht is al {{count}} keer gevlagd.","summary":{"action_type_3":{"one":"off-topic","other":"off-topic x{{count}}"},"action_type_4":{"one":"ongepast","other":"ongepast x{{count}}"},"action_type_6":{"one":"custom","other":"custom x{{count}}"},"action_type_7":{"one":"custom","other":"custom x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Primaire groep","no_primary":"(geen primaire groep)","title":"Groepen","edit":"Wijzig groepen","refresh":"Herlaad","new":"Nieuw","selector_placeholder":"vul gebruikersnaam in","name_placeholder":"Groepsnaam, geen spaties, zelfde regels als bij een gebruikersnaam","about":"Wijzig hier je deelname aan groepen en je namen","group_members":"Groepsleden","delete":"Verwijder","delete_confirm":"Verwijder deze groepen?","delete_failed":"Kan groep niet verwijderen. Als dit een automatische groep is, kan deze niet verwijderd worden.","delete_member_confirm":"Verwijder '%{username}' van de '%{group'} groep?","delete_owner_confirm":"Verwijder eigenaar privilege voor '% {username}'?","name":"Naam","add":"Voeg toe","add_members":"Voeg leden toe","custom":"Aangepast","bulk_complete":"De gebruikers zijn toegevoegd aan de groep.","bulk":"Bulk toevoegen aan groep.","bulk_paste":"Plak een lijst van gebruikersnamen of e-mails, één per regel:","bulk_select":"(selecteer een groep)","automatic":"Automatisch","automatic_membership_email_domains":"Gebruikers welke zich registeren met een email domein dat exact overeenkomt met de domeinen in deze lijst worden automatisch toegevoegd aan deze groep:","automatic_membership_retroactive":"Pas deze email domein regel toe op reeds geregistreerde gebruikers","default_title":"Standaard titel voor alle gebruikers in deze groep","primary_group":"Automatisch ingesteld als primaire groep","group_owners":"Eigenaren","add_owners":"Eigenaren toevoegen"},"api":{"generate_master":"Genereer Master API Key","none":"Er zijn geen actieve API keys","user":"Gebruiker","title":"API","key":"API Key","generate":"Genereer","regenerate":"Genereer opnieuw","revoke":"Intrekken","confirm_regen":"Weet je zeker dat je die API Key wil vervangen door een nieuwe?","confirm_revoke":"Weet je zeker dat je die API Key wil intrekken?","info_html":"Met deze API key kun je met behulp van JSON calls topics maken en bewerken.","all_users":"Alle gebruikers","note_html":"Houd deze sleutel \u003cstrong\u003egeheim\u003c/strong\u003e, gebruikers die deze sleutel hebben kunnen zich als elke andere gebruiker voordoen op het forum."},"plugins":{"title":"Plugins","installed":"Geïnstalleerde plugins","name":"Naam","none_installed":"Je hebt geen plugins geinstalleerd.","version":"Versie","enabled":"Ingeschakeld?","is_enabled":"J","not_enabled":"N","change_settings":"Wijzig instellingen","change_settings_short":"Instellingen","howto":"Hoe kan ik plugins installeren"},"backups":{"title":"Backups","menu":{"backups":"Backups","logs":"Logs"},"none":"Geen backup beschikbaar.","read_only":{"enable":{"title":"Zet forum in read-only modus","label":"Schakel read-only modus in","confirm":"Weet je zeker dat je het forum in read-only modus wil zetten?"},"disable":{"title":"Schakel read-only modus uit","label":"Schakel read-only modus uit"}},"logs":{"none":"Nog geen logs..."},"columns":{"filename":"Bestandsnaam","size":"Grootte"},"upload":{"label":"Upload","title":"Upload een backup naar deze instantie","uploading":"Uploaden...","success":"'{{filename}}' is geupload.","error":"Er ging iets fout bij het uploaden van '{{filename}}': {{message}}"},"operations":{"is_running":"Er wordt al een actie uitgevoerd...","failed":"De actie {{operation}} is mislukt. Kijk in de logs.","cancel":{"label":"Annuleer","title":"Annuleer de huidige actie","confirm":"Weet je zeker dat je de huidige actie wil annuleren?"},"backup":{"label":"Backup","title":"Maak een backup","confirm":"Wil je een nieuwe backup starten? ","without_uploads":"Ja (bestanden niet invoegen)"},"download":{"label":"Download","title":"Download de backup"},"destroy":{"title":"Verwijder de backup","confirm":"Weet je zeker dat je deze backup wil verwijderen?"},"restore":{"is_disabled":"Herstellen is uitgeschakeld in de instellingen.","label":"Herstel","title":"Herstel van deze backup","confirm":"Weet je zeker dat je van deze backup wil herstellen?"},"rollback":{"label":"Herstel","title":"Herstel de database naar de laatst werkende versie","confirm":"Weet je zeker dat je de database wil herstellen naar de laatste versie?"}}},"export_csv":{"user_archive_confirm":"Weet je zeker dat je al je berichten wil downloaden?","success":"Exporteren is gestart, je zult gewaarschuwd worden als het proces is beeindigd.","failed":"Exporteren is mislukt. Controleer de logbestanden.","rate_limit_error":"Berichten kunnen eens per dag gedownload worden, probeer a.u.b. morgen nog een keer.","button_text":"Exporteren","button_title":{"user":"Exporteer volledige gebruikerslijst in *.CSV-formaat","staff_action":"Exporteer volledige staf actie log in CSV formaat.","screened_email":"Exporteer volledige gescreende email lijst in CSV formaat.","screened_ip":"Exporteer volledige gescreende IP lijst in CSV formaat.","screened_url":"Exporteerd volledige gescreende URL lijst in CSV formaat."}},"export_json":{"button_text":"Exporteer"},"invite":{"button_text":"Verstuur uitnodigingen","button_title":"Verstuur uitnodigingen"},"customize":{"title":"Aanpassingen","long_title":"Aanpassingen aan de site","css":"CSS","header":"Header","top":"Top","footer":"Voettekst","embedded_css":"Embedded CSS","head_tag":{"text":"\u003c/head\u003e","title":"HTML dat ingevoegd wordt voor de \u003c/head\u003e tag"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML dat ingevoegd wordt voor de \u003c/body\u003e tag"},"override_default":"Sluit de standaard stylesheet uit","enabled":"Ingeschakeld?","preview":"voorbeeld","undo_preview":"verwijder voorbeeld","rescue_preview":"standaard stijl","explain_preview":"Bekijk de site met deze aangepaste stylesheet","explain_undo_preview":"Herstel huidige geactiveerde aangepaste stylesheet","explain_rescue_preview":"Bekijk de site met de standaard stylesheet","save":"Opslaan","new":"Nieuw","new_style":"Nieuwe stijl","import":"Importeer","import_title":"Selecteer een bestand of plak tekst.","delete":"Verwijder","delete_confirm":"Verwijder deze aanpassing?","about":"Pas CSS stylesheets en HTML headers aan op de site. Voeg een aanpassing toe om te beginnen.","color":"Kleur","opacity":"Doorzichtigheid","copy":"Kopieër","css_html":{"title":"CSS/HTML","long_title":"CSS en HTML aanpassingen"},"colors":{"title":"Kleuren","long_title":"Kleurenschema's","about":"Met kleurenschema's kun je de kleuren in de site aanpassen zonder CSS te hoeven gebruiken. Kies er één of voeg er één to om te beginnen.","new_name":"Nieuw kleurenschema","copy_name_prefix":"Kopie van","delete_confirm":"Dit kleurenschema verwijderen?","undo":"herstel","undo_title":"Draai je wijzigingen aan deze kleur terug tot de laatste keer dat het opgeslagen is.","revert":"Zet terug","revert_title":"Zet deze kleur terug naar het standaard kleurenschema van Discourse.","primary":{"name":"primaire","description":"Meeste teksten, iconen en randen."},"secondary":{"name":"secundaire","description":"De achtergrond- en tekstkleur van sommige knoppen."},"tertiary":{"name":"tertiaire","description":"Links, knoppen, notificaties en accentkleur."},"quaternary":{"name":"quaternaire","description":"Navigatie."},"header_background":{"name":"headerachtergrond","description":"Achtergrondkleur van de header."},"header_primary":{"name":"eerste header","description":"Tekst en iconen in de header."},"highlight":{"name":"opvallen","description":"De achtergrondkleur van "},"danger":{"name":"gevaar","description":"Opvallende kleuren voor acties als verwijderen van berichten en topics"},"success":{"name":"succes","description":"Gebruikt om aan te geven dat een actie gelukt is."},"love":{"name":"liefde","description":"De like knop kleur."},"wiki":{"name":"wiki","description":"Basiskleur die gebruikt wordt voor de achtergrond van wiki berichten."}}},"email":{"title":"E-mail","settings":"Instellingen","all":"Alle","sending_test":"Testmail wordt verstuurd...","error":"\u003cb\u003eFOUT\u003c/b\u003e - %{server_error}","test_error":"Er ging iets mis bij het versturen van de testmail. Kijk nog eens naar je mailinstellinen, controleer of je host mailconnecties niet blokkeert. Probeer daarna opnieuw.","sent":"Verzonden","skipped":"Overgeslagen","sent_at":"Verzonden op","time":"Tijd","user":"Gebruiker","email_type":"E-mailtype","to_address":"Ontvangeradres","test_email_address":"e-mailadres om te testen","send_test":"verstuur test e-mail","sent_test":"verzonden!","delivery_method":"Verzendmethode","preview_digest":"Voorbeeld digestmail","preview_digest_desc":"Voorbeeld van de digest e-mails die naar inactieve leden worden verzonden.","refresh":"Verniew","format":"Formaat","html":"html","text":"text","last_seen_user":"Laatste online:","reply_key":"Reply key","skipped_reason":"Reden van overslaan","logs":{"none":"Geen logs gevonden.","filters":{"title":"Filter","user_placeholder":"gebruikersnaam","address_placeholder":"naam@voorbeeld.nl","type_placeholder":"digest, inschijving","reply_key_placeholder":"antwoordsleutel","skipped_reason_placeholder":"reden"}}},"logs":{"title":"Logs","action":"Actie","created_at":"Gemaakt","last_match_at":"Laatste match","match_count":"Matches","ip_address":"IP","topic_id":"Topic ID","post_id":"Bericht ID","category_id":"Categorie ID","delete":"Verwijder","edit":"Wijzig","save":"Opslaan","screened_actions":{"block":"blokkeer","do_nothing":"doe niets"},"staff_actions":{"title":"Stafacties","instructions":"Klik op gebruikersnamen en acties om de lijst te filteren. Klik op profielfoto's om naar de gebruikerspagina te gaan.","clear_filters":"Bekijk alles","staff_user":"Staflid","target_user":"Selecteer gebruiker","subject":"Onderwerp","when":"Wanneer","context":"Context","details":"Details","previous_value":"Vorige","new_value":"Nieuw","diff":"Verschil","show":"Bekijk","modal_title":"Details","no_previous":"Er is geen vorige waarde","deleted":"Geen nieuwe waarde. De record was verwijderd.","actions":{"delete_user":"verwijder gebruiker","change_trust_level":"verander trustlevel","change_username":"wijzig gebruikersnaam","change_site_setting":"verander instellingen","change_site_customization":"verander site aanpassingen","delete_site_customization":"verwijder site aanpassingen","suspend_user":"schors gebruiker","unsuspend_user":"hef schorsing op","grant_badge":"ken badge toe","revoke_badge":"trek badge in","check_email":"check e-mail","delete_topic":"verwijder topic","delete_post":"verwijder bericht","impersonate":"Log in als gebruiker","anonymize_user":"maak gebruiker anoniem","roll_up":"groepeer verbannen IP-adressen","change_category_settings":"verander categorie instellingen","delete_category":"categorie verwijderen","create_category":"categorie creeren"}},"screened_emails":{"title":"Gescreende e-mails","description":"Nieuwe accounts met een van deze mailadressen worden geblokkeerd of een andere actie wordt ondernomen.","email":"E-mailadres","actions":{"allow":"Sta toe"}},"screened_urls":{"title":"Gescreende urls","description":"Deze urls zijn gebruikt door gebruikers die als spammer gemarkeerd zijn.","url":"URL","domain":"Domein"},"screened_ips":{"title":"Gescreende ip-adressen","description":"IP-adressen die in de gaten worden gehouden. Kies 'sta toe' om deze op een witte lijst te zetten.","delete_confirm":"Weet je zeker dat je de regel voor %{ip_address} wil verwijderen?","roll_up_confirm":"Weet je zeker dat je regelmatig gescreende IP-adressen wilt samenvoegen tot subnets?","rolled_up_some_subnets":"Succesvol IP ban entries samengevoegd tot deze subnets: %{subnets}.","rolled_up_no_subnet":"Er was niets om samen te voegen.","actions":{"block":"Blokkeer","do_nothing":"Sta toe","allow_admin":"Toestaan Beheerder"},"form":{"label":"Nieuw:","ip_address":"IP-adres","add":"Voeg toe","filter":"Zoek"},"roll_up":{"text":"Groepeer verbannen IP adressen","title":"Creëer nieuwe subnet ban entries als er tenminste 'min_ban_entries_for_roll_up' entries zijn."}},"logster":{"title":"Fout Logs"}},"impersonate":{"title":"Log in als gebruiker","help":"Gebruik dit hulpmiddel om in te loggen als een gebruiker voor debug-doeleinden. Je moet uitloggen als je klaar bent.","not_found":"Die gebruiker is niet gevonden","invalid":"Sorry, maar als deze gebruiker mag je niet inloggen."},"users":{"title":"Leden","create":"Voeg beheerder toe","last_emailed":"Laatste mail verstuurd","not_found":"Sorry, deze gebruikersnaam bestaat niet in ons systeem.","id_not_found":"Sorry, deze gebruikersnaam bestaat niet in ons systeem.","active":"Actief","show_emails":"Bekijk e-mails","nav":{"new":"Nieuw","active":"Actief","pending":"Te beoordelen","staff":"Stafleden","suspended":"Geschorst","blocked":"Geblokt","suspect":"Verdacht"},"approved":"Goedgekeurd?","approved_selected":{"one":"accepteer lid","other":"accepteer {{count}} leden"},"reject_selected":{"one":"weiger lid","other":"weiger {{count}} leden"},"titles":{"active":"Actieve leden","new":"Nieuwe leden","pending":"Nog niet geaccepteerde leden","newuser":"Leden met Trust Level 0 (Nieuw lid)","basic":"Leden met Trust Level 1 (Lid)","staff":"Stafleden","admins":"Administrators","moderators":"Moderators","blocked":"Geblokkeerde leden","suspended":"Geschorste leden","suspect":"Verdachte Gebruikers"},"reject_successful":{"one":"1 Gebruiker met succes geweigerd","other":"%{count} Gebruikers met succes geweigerd"},"reject_failures":{"one":"Weigering van 1 gebruiker is niet gelukt","other":"Weigering van %{count} gebruikers is niet gelukt"},"not_verified":"Niet geverifieerd","check_email":{"title":"Laat e-mail adres van gebruiker zien","text":"Bekijk"}},"user":{"suspend_failed":"Er ging iets fout met het blokkeren van deze gebruiker: {{error}}","unsuspend_failed":"Er ging iets fout bij het deblokkeren van deze gebruiker: {{error}}","suspend_duration":"Hoe lang wil je deze gebruiker blokkeren?","suspend_duration_units":"(dagen)","suspend_reason_label":"Waarom schors je deze gebruiker? \u003cb\u003eIedereen zal deze tekst kunnen zien\u003c/b\u003e op de profielpagina van deze gebruiker en zal getoond worden als deze gebruiker probeert in te loggen. Houd het kort en bondig.","suspend_reason":"Reden","suspended_by":"Geschorst door","delete_all_posts":"Verwijder alle berichten","delete_all_posts_confirm":"Je gaat %{posts} en %{topics} verwijderen. Zeker weten?","suspend":"Schors","unsuspend":"Herstel schorsing","suspended":"Geschorst?","moderator":"Moderator?","admin":"Beheerder?","blocked":"Geblokkeerd?","show_admin_profile":"Beheerder","edit_title":"Wijzig titel","save_title":"Bewaar titel","refresh_browsers":"Forceer browser refresh","refresh_browsers_message":"Bericht verstuurd aan alle gebruikers!","show_public_profile":"Bekijk openbaar profiel","impersonate":"Log in als gebruiker","ip_lookup":"Zoek IP-adres op","log_out":"Uitloggen","logged_out":"Gebruiker is uitgelogd op alle apparaten","revoke_admin":"Ontneem beheerdersrechten","grant_admin":"Geef Beheerdersrechten","revoke_moderation":"Ontneem modereerrechten","grant_moderation":"Geef modereerrechten","unblock":"Deblokkeer","block":"Blokkeer","reputation":"Reputatie","permissions":"Toestemmingen","activity":"Activiteit","like_count":"'Vind ik leuks' gegeven / ontvangen","last_100_days":"in de laatste 100 dagen","private_topics_count":"Privétopics","posts_read_count":"Berichten gelezen","post_count":"Berichten gemaakt","topics_entered":"Topics bekeken","flags_given_count":"Meldingen gedaan","flags_received_count":"Meldigen ontvangen","warnings_received_count":"Waarschuwingen Ontvangen","flags_given_received_count":"Meldingen gedaan / ontvangen","approve":"Accepteer","approved_by":"Geaccepteerd door","approve_success":"Gebruiker geaccepteerd en e-mail verzonden met instructies voor activering.","approve_bulk_success":"Alle geselecteerde gebruikers zijn geaccepteerd en een e-mail met instructies voor activering is verstuurd.","time_read":"Leestijd","anonymize":"Anonimiseer Gebruiker","anonymize_confirm":"Weet je ZEKER dat je dit account wilt anonimiseren? Dit zal de gebruikersnaam en email-adres veranderen en alle profiel informatie resetten.","anonymize_yes":"Ja, anonimiseer dit account","anonymize_failed":"Er was een probleem bij het anonimiseren van het account.","delete":"Verwijder gebruiker","delete_forbidden_because_staff":"Admins en moderatoren kunnen niet verwijderd worden.","delete_posts_forbidden_because_staff":"Kan niet alle berichten van beheerders en moderatoren verwijderen.","delete_forbidden":{"one":"Gebruikers kunnen niet worden verwijderd als ze berichten geplaatst hebben. Verwijder alle berichten voordat je een gebruiker probeert te verwijderen. (Berichten ouder dan %{count} dag kunnen niet verwijderd worden)","other":"Gebruikers kunnen niet worden verwijderd als ze berichten geplaatst hebben. Verwijder alle berichten voordat je een gebruiker probeert te verwijderen. (Berichten ouder dan %{count} dagen kunnen niet verwijderd worden)"},"cant_delete_all_posts":{"one":"Kan niet alle berichten verwijderen. Sommige berichten zijn ouder dan %{count} dag (de delete_user_max_post_age instelling).","other":"Kan niet alle berichten verwijderen. Sommige berichten zijn ouder dan %{count} dagen (de delete_user_max_post_age instelling)."},"cant_delete_all_too_many_posts":{"one":"Kan niet alle berichten verwijderen omdat de gebruiker meer dan 1 bericht heeft (delete_all_posts_max).","other":"Kan niet alle berichten verwijderen omdat de gebruiker meer dan %{count} berichten heeft (delete_all_posts_max)."},"delete_confirm":"Weet je zeker dat je deze gebruiker definitief wil verwijderen? Deze handeling kan niet ongedaan worden gemaakt! ","delete_and_block":"Verwijder en \u003cb\u003eblokkeer\u003c/b\u003e dit e-mail- en IP-adres","delete_dont_block":"Alleen verwijderen","deleted":"De gebruiker is verwijderd.","delete_failed":"Er ging iets mis bij het verwijderen van deze gebruiker. Zorg er voor dat alle berichten van deze gebruiker eerst verwijderd zijn.","send_activation_email":"Verstuur activatiemail","activation_email_sent":"Een activatiemail is verstuurd.","send_activation_email_failed":"Er ging iets mis bij het versturen van de activatiemail.","activate":"Activeer account","activate_failed":"Er ging iets mis bij het activeren van deze gebruiker.","deactivate_account":"Deactiveer account","deactivate_failed":"Er ging iets mis bij het deactiveren van deze gebruiker.","unblock_failed":"Er ging iets mis bij het deblokkeren van deze gebruiker.","block_failed":"Er ging iets mis bij het blokkeren van deze gebruiker.","deactivate_explanation":"Een gedeactiveerde gebruiker moet zijn e-mailadres opnieuw bevestigen.","suspended_explanation":"Een geschorste gebruiker kan niet meer inloggen.","block_explanation":"Een geblokkeerde gebruiker kan geen topics maken of reageren op topics.","trust_level_change_failed":"Er ging iets mis bij het wijzigen van het trust level van deze gebruiker.","suspend_modal_title":"Schors gebruiker","trust_level_2_users":"Trust Level 2 leden","trust_level_3_requirements":"Trust Level 3 vereisten","trust_level_locked_tip":"trust level is geblokkeerd, het systeem zal geen gebruiker bevorderen of degraderen","trust_level_unlocked_tip":"trust level is gedeblokkeerd, het systeem zal gebruiker bevorderen of degraderen","lock_trust_level":"Zet trustlevel vast","unlock_trust_level":"Deblokkeer Trust Level","tl3_requirements":{"title":"Vereisten voor Trust Level 3","table_title":"In de afgelopen 100 dagen:","value_heading":"Waarde","requirement_heading":"Vereiste","visits":"Bezoeken","days":"dagen","topics_replied_to":"Topics waarin gereageerd is","topics_viewed":"Bekeken topics","topics_viewed_all_time":"Topics bezocht (ooit)","posts_read":"Gelezen berichten","posts_read_all_time":"Berichten gelezen (ooit)","flagged_posts":"Gemarkeerde berichten","flagged_by_users":"Gebruikers die gemarkeerd hebben","likes_given":"'Vind ik leuks' gegeven","likes_received":"'Vind ik leuks' ontvangen","likes_received_days":"Ontvangen likes: unieke dagen","likes_received_users":"Ontvangen likes: unieke gebruikers","qualifies":"Komt in aanmerking voor Trust Level 3","does_not_qualify":"Komt niet in aanmerking voor Trust Level 3","will_be_promoted":"Zal binnenkort gepromoot worden.","will_be_demoted":"Zal binnenkort gedegradeerd worden.","on_grace_period":"Op het ogenblik in promotie gratieperiode, zal niet worden gedegradeerd.","locked_will_not_be_promoted":"Trust level geblokkeerd. Zal nooit bevorderd worden.","locked_will_not_be_demoted":"Trust level geblokkeerd. Zal nooit gedegradeerd worden."},"sso":{"title":"Single Sign On","external_id":"Externe ID","external_username":"Gebruikersnaam","external_name":"Naam","external_email":"E-mail","external_avatar_url":"URL van profielfoto"}},"user_fields":{"title":"Gebruikersvelden","help":"Voeg velden toe die je gebruikers in kunnen vullen.","create":"Maak gebruikersveld","untitled":"Geen titel","name":"Veldnaam","type":"Veldtype","description":"Veldomschrijving","save":"Opslaan","edit":"Wijzig","delete":"Verwijder","cancel":"Annuleer","delete_confirm":"Weet je zeker dat je dat gebruikersveld wilt verwijderen?","options":"Opties","required":{"title":"Verplicht bij inschrijven?","enabled":"verplicht","disabled":"niet verplicht"},"editable":{"title":"Bewerkbaar na aanmelden?","enabled":"kan gewijzigd worden","disabled":"wijzigen niet mogelijk"},"show_on_profile":{"title":"Laat zien op het publieke profiel?","enabled":"wordt getoond op profiel","disabled":"wordt niet getoond op profiel"},"field_types":{"text":"Tekstveld","confirm":"Bevestiging","dropdown":"Uitklapbaar"}},"site_text":{"none":"Kies een type van inhoud om te beginnen met bewerken.","title":"Tekst Inhoud"},"site_settings":{"show_overriden":"Bekijk alleen bewerkte instellingen","title":"Instellingen","reset":"herstel","none":"geen","no_results":"Geen resultaten.","clear_filter":"Wis","add_url":"voeg URL toe","add_host":"host toevoegen","categories":{"all_results":"Alle","required":"Vereist","basic":"Basissetup","users":"Gebruikers","posting":"Schrijven","email":"E-mail","files":"Bestanden","trust":"Trustlevels","security":"Beveiliging","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Rate limits","developer":"Ontwikkelaar","embedding":"Embedden","legal":"Juridisch","uncategorized":"Overige","backups":"Backups","login":"Gebruikersnaam","plugins":"Plugins","user_preferences":"Gebruikersvoorkeuren"}},"badges":{"title":"Badges","new_badge":"Nieuwe badge","new":"Nieuw","name":"Naam","badge":"Embleem","display_name":"Lange naam","description":"Omschrijving","badge_type":"Badgetype","badge_grouping":"Groep","badge_groupings":{"modal_title":"Badge Groeperingen"},"granted_by":"Toegekend door","granted_at":"Toegekend op","reason_help":"(een link naar een bericht op topic)","save":"Bewaar","delete":"Verwijder","delete_confirm":"Weet je zeker dat je deze badge wil verwijderen?","revoke":"Intrekken","reason":"Reden","expand":"Uitklappen...","revoke_confirm":"Weet je zeker dat je deze badge in wil trekken?","edit_badges":"Wijzig badges","grant_badge":"Ken badge toe","granted_badges":"Toegekende badges","grant":"Toekennen","no_user_badges":"%{name} heeft nog geen badges toegekend gekregen.","no_badges":"Er zijn geen badges die toegekend kunnen worden.","none_selected":"Selecteer een badge om aan de slag te gaan","allow_title":"Embleem mag als titel gebruikt worden","multiple_grant":"Kan meerdere malen worden toegekend","listable":"Badge op de publieke badges pagina tonen","enabled":"Badge aanzetten","icon":"Icoon","image":"Afbeelding","icon_help":"Gebruik ofwel een Font Awesome klasse of een URL naar een afbeelding","query":"Badge Query (SQL)","target_posts":"Geassocieerde berichten opvragen","auto_revoke":"Intrekkingsquery dagelijks uitvoeren","show_posts":"Toon bericht verlenend badge op badge pagina","trigger":"Trekker","trigger_type":{"none":"Dagelijks bijwerken","post_action":"Wanneer een gebruiker handelt op een bericht","post_revision":"Wanneer een gebruiker een bericht wijzigt of creeert","trust_level_change":"Wanneer een gebruiker van trust level verandert","user_change":"Wanneer een gebruiker is gewijzigd of gecreeerd"},"preview":{"link_text":"Voorbeeld toegekende badges","plan_text":"Voorbeeld met uitvoeringsplan","modal_title":"Proefverwerking Badge Query","sql_error_header":"Er ging iets fout met de query.","error_help":"Bekijk de volgende links voor hulp met badge queries.","bad_count_warning":{"header":"LET OP!","text":"Er zijn vermiste toekennings-voorbeelden. Dit gebeurt als de badge query gebruikers- of bericht-ID's retourneert die niet bestaan. Dit kan onverwachte resultaten veroorzaken op een later tijdstip - kijk a.u.b. uw query goed na."},"sample":"Voorbeeld:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e voor bericht in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e voor bericht in %{link} om \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e om \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Voeg nieuwe emoji toe welke beschikbaar zullen zijn voor iedereen. (PROTIP: drag \u0026 drop meerdere bestanden ineens)","add":"Voeg Nieuw Emoji Toe","name":"Naam","image":"Afbeelding","delete_confirm":"Weet je zeker dat je de :%{name}: emoji wilt verwijderen?"},"embedding":{"get_started":"Als je Discourse wilt embedden in een andere website, begin met het toevoegen van de host van die website.","confirm_delete":"Weet je zeker dat je die host wilt verwijderen?","sample":"Gebruik de volgende HTML code om discourse topics te maken en te embedden in je website . Vervang \u003cb\u003eREPLACE_ME\u003c/b\u003e met de canonical URL van de pagina waarin je wilt embedden.","title":"Embedden","host":"Toegestane Hosts","edit":"wijzig","category":"Bericht naar Categorie","add_host":"Host Toevoegen","settings":"Embedding Instellingen","feed_settings":"Feed Instellingen","feed_description":"Een RRS/ATOM feed op je site kan de import van content naar Discourse verbeteren.","crawling_settings":"Crawler Instellingen","crawling_description":"Als Discourse topics maakt voor je berichten, zonder dat er gebruik gemaakt wordt van RSS/ATOM feed, dan zal Discourse proberen je content vanuit je HTML te parsen. Soms kan het een complex zijn om je content af te leiden, daarom voorziet Discourse in de mogelijkheid voor het specificeren van CSS regels om het afleiden gemakkelijker te maken.","embed_by_username":"Gebruikersnaam voor het maken van topics","embed_post_limit":"Maximaal aantal berichten om te embedden","embed_username_key_from_feed":"Key voor de Discourse gebruikersnaam in de feed.","embed_truncate":"Embedde berichten inkorten","embed_whitelist_selector":"CSS selector voor elementen die worden toegestaan bij embedding","embed_blacklist_selector":"CSS selector voor elementen die worden verwijderd bij embedding","feed_polling_enabled":"Importeer berichten via RSS/ATOM","feed_polling_url":"URL van RSS/ATOM feed voor crawling","save":"Embedding Instellingen Opslaan "},"permalink":{"title":"Permalink","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Bericht ID","post_title":"Bericht","category_id":"Categorie ID","category_title":"Categorie","external_url":"Externe URL","delete_confirm":"Weet je zeker dat je deze permalink wil verwijderen?","form":{"label":"Nieuw:","add":"Voeg toe","filter":"Zoeken (URL of Externe URL)"}}},"lightbox":{"download":"download"},"search_help":{"title":"Zoek in Help"},"keyboard_shortcuts_help":{"title":"Sneltoetsen","jump_to":{"title":"Spring naar","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Hoofdpagina","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Laatste","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nieuw","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Ongelezen","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Categoriën","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Top","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Favorieten","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profiel","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Berichten"},"navigation":{"title":"Navigatie","jump":"\u003cb\u003e#\u003c/b\u003e Ga naar bericht #","back":"\u003cb\u003eu\u003c/b\u003e Terug","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Verplaats selectie \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e of \u003cb\u003eEnter\u003c/b\u003e Open geselecteerde topic","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Volgende/vorige sectie"},"application":{"title":"Applicatie","create":"\u003cb\u003ec\u003c/b\u003e Maak nieuwe topic","notifications":"\u003cb\u003en\u003c/b\u003e Open notificaties","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Open gebruikersmenu","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Toon gewijzigde topics","search":"\u003cb\u003e/\u003c/b\u003e Zoek","help":"\u003cb\u003e?\u003c/b\u003e Open sneltoetsen help","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Seponeer Nieuw/Berichten","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Seponeer Topics","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Uitloggen"},"actions":{"title":"Acties","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Toggle bladwijzer van topic","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Vastpinnen/Ontpinnen topic","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Deel topic","share_post":"\u003cb\u003es\u003c/b\u003e Deel bericht","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Reageer als verwezen topic","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Reageer op topic","reply_post":"\u003cb\u003eshift r\u003c/b\u003e Reageer op bericht","quote_post":"\u003cb\u003eq\u003c/b\u003e Citeer bericht","like":"\u003cb\u003el\u003c/b\u003e Vind bericht leuk","flag":"\u003cb\u003e!\u003c/b\u003e Markeer bericht","bookmark":"\u003cb\u003eb\u003c/b\u003e Bookmark bericht","edit":"\u003cb\u003ee\u003c/b\u003e Wijzig bericht","delete":"\u003cb\u003ed\u003c/b\u003e Verwijder bericht","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Negeer topic","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Markeer topic als normaal","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Markeer topic als volgen","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Markeer topic als in de gaten houden"}},"badges":{"title":"Badges","allow_title":"kan als titel gebruikt worden","multiple_grant":"kan meerdere keren toegekend worden","badge_count":{"one":"1 Badge","other":"%{count} Badges"},"more_badges":{"one":"+1 Meer","other":"+%{count} Meer"},"granted":{"one":"1 toegekend","other":"%{count} toegekend"},"select_badge_for_title":"Kies een badge om als je titel te gebruiken","none":"\u003cgeen\u003e","badge_grouping":{"getting_started":{"name":"Aan De Slag"},"community":{"name":"Community"},"trust_level":{"name":"Trust Level"},"other":{"name":"Overige"},"posting":{"name":"Schrijven"}},"badge":{"editor":{"name":"Redacteur","description":"Eerste berichtwijziging"},"basic_user":{"name":"Basis","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eToegang verleend tot\u003c/a\u003e alle essentiële gemeenschaps-functionaliteit."},"member":{"name":"Lid","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eToegang verleend tot\u003c/a\u003e uitnodigingen"},"regular":{"name":"Vaste bezoeker","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eToegang verleend tot\u003c/a\u003e hercategoriseren, hernoemen, gevolgde links en lounge"},"leader":{"name":"Leider","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eToegang verleend tot\u003c/a\u003e globaal wijzigen, vastpinnen, sluiten, archiveren, splitsen en samenvoegen"},"welcome":{"name":"Welkom","description":"Like ontvangen."},"autobiographer":{"name":"Autobiografist","description":"\u003ca href=\"/my/preferences\"\u003eGebruikersprofiel\u003c/a\u003e informatie ingevuld"},"anniversary":{"name":"Verjaardag","description":"Actief lid voor een jaar, heeft tenminste eenmaal iets gepost"},"nice_post":{"name":"Prima bericht","description":"10 likes op een post ontvangen. Deze badge kan meerdere keren worden toegekend."},"good_post":{"name":"Goed bericht","description":"25 likes op een post ontvangen. Deze badge kan meerdere keren worden toegekend."},"great_post":{"name":"Fantastisch Bericht","description":"50 likes op een post ontvangen. Deze badge kan meerdere keren worden toegekend."},"nice_topic":{"name":"Leuk Topic","description":"10 likes ontvangen op een topic. Deze badge kan meerdere keren toegewezen worden."},"good_topic":{"name":"Goed Topic","description":"25 likes ontvangen op een topic. Deze badge kan meerdere keren toegewezen worden."},"great_topic":{"name":"Geweldig Topic","description":"50 likes ontvangen op een topic. Deze badge kan meerdere keren toegewezen worden."},"nice_share":{"name":"Leuk Gedeeld","description":"Een bericht met 25 unieke bezoekers gedeeld"},"good_share":{"name":"Goed Gedeeld","description":"Een bericht met 300 unieke bezoekers gedeeld"},"great_share":{"name":"Geweldig Gedeeld","description":"Een bericht met 1000 unieke bezoekers gedeeld"},"first_like":{"name":"Eerste like","description":"Hebt een bericht ge-vind-ik-leukt"},"first_flag":{"name":"Eerste markering","description":"Een bericht gemarkeerd"},"promoter":{"name":"Promoter","description":"Heeft een gebruiker uitgenodigd"},"campaigner":{"name":"Campaigner","description":"Heeft 3 leden (trust level 1) uitgenodigd"},"champion":{"name":"Kampioen","description":"Heeft 5 leden (trust level 2) uitgenodigd"},"first_share":{"name":"Eerste deel actie","description":"Een bericht gedeeld"},"first_link":{"name":"Eerste link","description":"Een interne link toegevoegd aan een ander topic"},"first_quote":{"name":"Eerste citaat","description":"Een gebruiker geciteerd"},"read_guidelines":{"name":"Heeft de richtlijnen gelezen","description":"Lees de \u003ca href=\"/guidelines\"\u003ecommunity richtlijnen\u003c/a\u003e"},"reader":{"name":"Lezer","description":"Lees elk bericht in een topic met meer dan 100 berichten."},"popular_link":{"name":"Populaire Link","description":"Heeft een externe link geplaatst die 50 keer of vaker is aangeklikt."},"hot_link":{"name":"Zeer Populaire Link","description":"Heeft een externe link geplaatst die 300 keer of vaker is aangeklikt"},"famous_link":{"name":"Uiterst Populaire Link","description":"Heeft een externe link geplaatst die 1000 keer of vaker is aangeklikt"}}},"google_search":"\u003ch3\u003eZoek met Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","feature_topic":{"not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls"},"post":{"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"}},"category":{"contains_messages":"Change this category to only contain messages."},"flagging":{"notify_staff":"Notify Staff"},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}}}}}};
I18n.locale = 'nl';
//! moment.js
//! version : 2.8.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {
    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = '2.8.1',
        // the global-scope this is NOT the global object in Node.js
        globalScope = typeof global !== 'undefined' ? global : this,
        oldGlobalMoment,
        round = Math.round,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

        // internal storage for locale config files
        locales = {},

        // extra moment internal properties (plugins register props here)
        momentProperties = [],

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

        // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
        // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
        parseTokenOrdinal = /\d{1,2}/,

        //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
            ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
            ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
            ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
            ['GGGG-[W]WW', /\d{4}-W\d{2}/],
            ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            D : 'date',
            w : 'week',
            W : 'isoWeek',
            M : 'month',
            Q : 'quarter',
            y : 'year',
            DDD : 'dayOfYear',
            e : 'weekday',
            E : 'isoWeekday',
            gg: 'weekYear',
            GG: 'isoWeekYear'
        },

        camelFunctions = {
            dayofyear : 'dayOfYear',
            isoweekday : 'isoWeekday',
            isoweek : 'isoWeek',
            weekyear : 'weekYear',
            isoweekyear : 'isoWeekYear'
        },

        // format function strings
        formatFunctions = {},

        // default relative time thresholds
        relativeTimeThresholds = {
            s: 45,  // seconds to minute
            m: 45,  // minutes to hour
            h: 22,  // hours to day
            d: 26,  // days to month
            M: 11   // months to year
        },

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.localeData().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.localeData().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.localeData().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.localeData().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.localeData().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            YYYYYY : function () {
                var y = this.year(), sign = y >= 0 ? '+' : '-';
                return sign + leftZeroFill(Math.abs(y), 6);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return leftZeroFill(this.weekYear(), 4);
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 4);
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return toInt(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(toInt(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            SSSS : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + ':' + leftZeroFill(toInt(a) % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            },
            Q : function () {
                return this.quarter();
            }
        },

        deprecations = {},

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'];

    // Pick the first defined of two or three arguments. dfl comes from
    // default.
    function dfl(a, b, c) {
        switch (arguments.length) {
            case 2: return a != null ? a : b;
            case 3: return a != null ? a : b != null ? b : c;
            default: throw new Error('Implement me');
        }
    }

    function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
            empty : false,
            unusedTokens : [],
            unusedInput : [],
            overflow : -2,
            charsLeftOver : 0,
            nullInput : false,
            invalidMonth : null,
            invalidFormat : false,
            userInvalidated : false,
            iso: false
        };
    }

    function printMsg(msg) {
        if (moment.suppressDeprecationWarnings === false &&
                typeof console !== 'undefined' && console.warn) {
            console.warn("Deprecation warning: " + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        return extend(function () {
            if (firstTime) {
                printMsg(msg);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            printMsg(msg);
            deprecations[name] = true;
        }
    }

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.localeData().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Locale() {
    }

    // Moment prototype object
    function Moment(config, skipOverflow) {
        if (skipOverflow !== false) {
            checkOverflow(config);
        }
        copyConfig(this, config);
        this._d = new Date(+config._d);
    }

    // Duration Constructor
    function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = moment.localeData();

        this._bubble();
    }

    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }

        if (b.hasOwnProperty('toString')) {
            a.toString = b.toString;
        }

        if (b.hasOwnProperty('valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function copyConfig(to, from) {
        var i, prop, val;

        if (typeof from._isAMomentObject !== 'undefined') {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (typeof from._i !== 'undefined') {
            to._i = from._i;
        }
        if (typeof from._f !== 'undefined') {
            to._f = from._f;
        }
        if (typeof from._l !== 'undefined') {
            to._l = from._l;
        }
        if (typeof from._strict !== 'undefined') {
            to._strict = from._strict;
        }
        if (typeof from._tzm !== 'undefined') {
            to._tzm = from._tzm;
        }
        if (typeof from._isUTC !== 'undefined') {
            to._isUTC = from._isUTC;
        }
        if (typeof from._offset !== 'undefined') {
            to._offset = from._offset;
        }
        if (typeof from._pf !== 'undefined') {
            to._pf = from._pf;
        }
        if (typeof from._locale !== 'undefined') {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (typeof val !== 'undefined') {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        other = makeAs(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, "moment()." + name  + "(period, number) is deprecated. Please use moment()." + name + "(number, period).");
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = moment.duration(val, period);
            addOrSubtractDurationFromMoment(this, dur, direction);
            return this;
        };
    }

    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
            rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            moment.updateOffset(mom, days || months);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return Object.prototype.toString.call(input) === '[object Date]' ||
            input instanceof Date;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        if (units) {
            var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
            units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (inputObject.hasOwnProperty(prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
            count = 7;
            setter = 'day';
        }
        else if (field.indexOf('month') === 0) {
            count = 12;
            setter = 'month';
        }
        else {
            return;
        }

        moment[field] = function (format, index) {
            var i, getter,
                method = moment._locale[field],
                results = [];

            if (typeof format === 'number') {
                index = format;
                format = undefined;
            }

            getter = function (i) {
                var m = moment().utc().set(setter, i);
                return method.call(moment._locale, m, format || '');
            };

            if (index != null) {
                return getter(index);
            }
            else {
                for (i = 0; i < count; i++) {
                    results.push(getter(i));
                }
                return results;
            }
        };
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
            overflow =
                m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
                m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 23 ? HOUR :
                m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }
    }

    function isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0;
            }
        }
        return m._isValid;
    }

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        if (!locales[name] && hasModule) {
            try {
                oldLocale = moment.locale();
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we want to undo that for lazy loaded locales
                moment.locale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function makeAs(input, model) {
        return model._isUTC ? moment(input).zone(model._offset || 0) :
            moment(input).local();
    }

    /************************************
        Locale
    ************************************/


    extend(Locale.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_'),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : 'h:mm A',
            L : 'MM/DD/YYYY',
            LL : 'MMMM D, YYYY',
            LLL : 'MMMM D, YYYY LT',
            LLLL : 'dddd, MMMM D, YYYY LT'
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : 'in %s',
            past : '%s ago',
            s : 'a few seconds',
            m : 'a minute',
            mm : '%d minutes',
            h : 'an hour',
            hh : '%d hours',
            d : 'a day',
            dd : '%d days',
            M : 'a month',
            MM : '%d months',
            y : 'a year',
            yy : '%d years'
        },

        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },

        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace('%d', number);
        },
        _ordinal : '%d',

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        _invalidDate: 'Invalid date',
        invalidDate: function () {
            return this._invalidDate;
        }
    });

    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
            return parseTokenOneDigit;
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
            return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
            return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
            return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
            if (strict) {
                return parseTokenOneDigit;
            }
            /* falls through */
        case 'SS':
            if (strict) {
                return parseTokenTwoDigits;
            }
            /* falls through */
        case 'SSS':
            if (strict) {
                return parseTokenThreeDigits;
            }
            /* falls through */
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return config._locale._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'SSSS':
            return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
            return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
            return parseTokenOneOrTwoDigits;
        case 'Do':
            return parseTokenOrdinal;
        default :
            a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), 'i'));
            return a;
        }
    }

    function timezoneMinutesFromString(string) {
        string = string || '';
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
            tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
            parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // QUARTER
        case 'Q':
            if (input != null) {
                datePartArray[MONTH] = (toInt(input) - 1) * 3;
            }
            break;
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[MONTH] = toInt(input) - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = config._locale.monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[MONTH] = a;
            } else {
                config._pf.invalidMonth = input;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[DATE] = toInt(input);
            }
            break;
        case 'Do' :
            if (input != null) {
                datePartArray[DATE] = toInt(parseInt(input, 10));
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                config._dayOfYear = toInt(input);
            }

            break;
        // YEAR
        case 'YY' :
            datePartArray[YEAR] = moment.parseTwoDigitYear(input);
            break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
            datePartArray[YEAR] = toInt(input);
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = config._locale.isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[HOUR] = toInt(input);
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[MINUTE] = toInt(input);
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[SECOND] = toInt(input);
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
            datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        // WEEKDAY - human
        case 'dd':
        case 'ddd':
        case 'dddd':
            a = config._locale.weekdaysParse(input);
            // if we didn't get a weekday name, mark the date as invalid
            if (a != null) {
                config._w = config._w || {};
                config._w['d'] = a;
            } else {
                config._pf.invalidWeekday = input;
            }
            break;
        // WEEK, WEEK DAY - numeric
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'e':
        case 'E':
            token = token.substr(0, 1);
            /* falls through */
        case 'gggg':
        case 'GGGG':
        case 'GGGGG':
            token = token.substr(0, 2);
            if (input) {
                config._w = config._w || {};
                config._w[token] = toInt(input);
            }
            break;
        case 'gg':
        case 'GG':
            config._w = config._w || {};
            config._w[token] = moment.parseTwoDigitYear(input);
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = dfl(w.GG, config._a[YEAR], weekOfYear(moment(), 1, 4).year);
            week = dfl(w.W, 1);
            weekday = dfl(w.E, 1);
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = dfl(w.gg, config._a[YEAR], weekOfYear(moment(), dow, doy).year);
            week = dfl(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < dow) {
                    ++week;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);

        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromConfig(config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = dfl(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = makeUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
        // Apply timezone offset from input. The actual zone can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() + config._tzm);
        }
    }

    function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
            return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
            normalizedInput.year,
            normalizedInput.month,
            normalizedInput.day,
            normalizedInput.hour,
            normalizedInput.minute,
            normalizedInput.second,
            normalizedInput.millisecond
        ];

        dateFromConfig(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        if (config._f === moment.ISO_8601) {
            parseISO(config);
            return;
        }

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // handle am pm
        if (config._isPm && config._a[HOUR] < 12) {
            config._a[HOUR] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[HOUR] === 12) {
            config._a[HOUR] = 0;
        }

        dateFromConfig(config);
        checkOverflow(config);
    }

    function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        });
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    // date from iso format
    function parseISO(config) {
        var i, l,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be "T" or undefined
                    config._f = isoDates[i][0] + (match[6] || ' ');
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(parseTokenTimezone)) {
                config._f += 'Z';
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function makeDateFromString(config) {
        parseISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            moment.createFromInputFallback(config);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i, matched;
        if (input === undefined) {
            config._d = new Date();
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if ((matched = aspNetJsonRegex.exec(input)) !== null) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromConfig(config);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    function parseWeekday(input, locale) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = locale.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(posNegDuration, withoutSuffix, locale) {
        var duration = moment.duration(posNegDuration).abs(),
            seconds = round(duration.as('s')),
            minutes = round(duration.as('m')),
            hours = round(duration.as('h')),
            days = round(duration.as('d')),
            months = round(duration.as('M')),
            years = round(duration.as('y')),

            args = seconds < relativeTimeThresholds.s && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < relativeTimeThresholds.m && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < relativeTimeThresholds.h && ['hh', hours] ||
                days === 1 && ['d'] ||
                days < relativeTimeThresholds.d && ['dd', days] ||
                months === 1 && ['M'] ||
                months < relativeTimeThresholds.M && ['MM', months] ||
                years === 1 && ['y'] || ['yy', years];

        args[2] = withoutSuffix;
        args[3] = +posNegDuration > 0;
        args[4] = locale;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add(daysToDayOfWeek, 'd');
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        d = d === 0 ? 7 : d;
        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year: dayOfYear > 0 ? year : year - 1,
            dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || moment.localeData(config._l);

        if (input === null || (format === undefined && input === '')) {
            return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (moment.isMoment(input)) {
            return new Moment(input, true);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = locale;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
    };

    moment.suppressDeprecationWarnings = false;

    moment.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i);
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return moment();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    moment.min = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    };

    moment.max = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    };

    // creating with utc
    moment.utc = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === "boolean") {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            parseIso,
            diffRes;

        if (moment.isDuration(input)) {
            duration = {
                ms: input._milliseconds,
                d: input._days,
                M: input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y: 0,
                d: toInt(match[DATE]) * sign,
                h: toInt(match[HOUR]) * sign,
                m: toInt(match[MINUTE]) * sign,
                s: toInt(match[SECOND]) * sign,
                ms: toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoDurationRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            parseIso = function (inp) {
                // We'd normally use ~~inp for this, but unfortunately it also
                // converts floats to ints.
                // inp may be undefined, so careful calling replace on it.
                var res = inp && parseFloat(inp.replace(',', '.'));
                // apply sign while we're at it
                return (isNaN(res) ? 0 : res) * sign;
            };
            duration = {
                y: parseIso(match[2]),
                M: parseIso(match[3]),
                d: parseIso(match[4]),
                h: parseIso(match[5]),
                m: parseIso(match[6]),
                s: parseIso(match[7]),
                w: parseIso(match[8])
            };
        } else if (typeof duration === 'object' &&
                ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(moment(duration.from), moment(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && input.hasOwnProperty('_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // constant that refers to the ISO standard
    moment.ISO_8601 = function () {};

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    moment.momentProperties = momentProperties;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function allows you to set a threshold for relative time strings
    moment.relativeTimeThreshold = function (threshold, limit) {
        if (relativeTimeThresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return relativeTimeThresholds[threshold];
        }
        relativeTimeThresholds[threshold] = limit;
        return true;
    };

    moment.lang = deprecate(
        "moment.lang is deprecated. Use moment.locale instead.",
        function (key, value) {
            return moment.locale(key, value);
        }
    );

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    moment.locale = function (key, values) {
        var data;
        if (key) {
            if (typeof(values) !== "undefined") {
                data = moment.defineLocale(key, values);
            }
            else {
                data = moment.localeData(key);
            }

            if (data) {
                moment.duration._locale = moment._locale = data;
            }
        }

        return moment._locale._abbr;
    };

    moment.defineLocale = function (name, values) {
        if (values !== null) {
            values.abbr = name;
            if (!locales[name]) {
                locales[name] = new Locale();
            }
            locales[name].set(values);

            // backwards compat for now: also set the locale
            moment.locale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    };

    moment.langData = deprecate(
        "moment.langData is deprecated. Use moment.localeData instead.",
        function (key) {
            return moment.localeData(key);
        }
    );

    // returns locale data
    moment.localeData = function (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return moment._locale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment ||
            (obj != null &&  obj.hasOwnProperty('_isAMomentObject'));
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };

    for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
    }

    moment.normalizeUnits = function (units) {
        return normalizeUnits(units);
    };

    moment.invalid = function (flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    };

    moment.parseZone = function () {
        return moment.apply(null, arguments).parseZone();
    };

    moment.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.clone().locale('en').format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            var m = moment(this).utc();
            if (0 < m.year() && m.year() <= 9999) {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            } else {
                return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            return isValid(this);
        },

        isDSTShifted : function () {
            if (this._a) {
                return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
            }

            return false;
        },

        parsingFlags : function () {
            return extend({}, this._pf);
        },

        invalidAt: function () {
            return this._pf.overflow;
        },

        utc : function (keepLocalTime) {
            return this.zone(0, keepLocalTime);
        },

        local : function (keepLocalTime) {
            if (this._isUTC) {
                this.zone(0, keepLocalTime);
                this._isUTC = false;

                if (keepLocalTime) {
                    this.add(this._d.getTimezoneOffset(), 'm');
                }
            }
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.localeData().postformat(output);
        },

        add : createAdder(1, 'add'),

        subtract : createAdder(-1, 'subtract'),

        diff : function (input, units, asFloat) {
            var that = makeAs(input, this),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function (time) {
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're zone'd or not.
            var now = time || moment(),
                sod = makeAs(now, this).startOf('day'),
                diff = this.diff(sod, 'days', true),
                format = diff < -6 ? 'sameElse' :
                    diff < -1 ? 'lastWeek' :
                    diff < 0 ? 'lastDay' :
                    diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                    diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.localeData().calendar(format, this));
        },

        isLeapYear : function () {
            return isLeapYear(this.year());
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.localeData());
                return this.add(input - day, 'd');
            } else {
                return day;
            }
        },

        month : makeAccessor('Month', true),

        startOf : function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoWeek') {
                this.isoWeekday(1);
            }

            // quarters are also special
            if (units === 'quarter') {
                this.month(Math.floor(this.month() / 3) * 3);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = units || 'ms';
            return +this.clone().startOf(units) === +makeAs(input, this).startOf(units);
        },

        min: deprecate(
                 'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
                 function (other) {
                     other = moment.apply(null, arguments);
                     return other < this ? this : other;
                 }
         ),

        max: deprecate(
                'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
                function (other) {
                    other = moment.apply(null, arguments);
                    return other > this ? this : other;
                }
        ),

        // keepLocalTime = true means only change the timezone, without
        // affecting the local hour. So 5:31:26 +0300 --[zone(2, true)]-->
        // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist int zone
        // +0200, so we adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        zone : function (input, keepLocalTime) {
            var offset = this._offset || 0,
                localAdjust;
            if (input != null) {
                if (typeof input === 'string') {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                if (!this._isUTC && keepLocalTime) {
                    localAdjust = this._d.getTimezoneOffset();
                }
                this._offset = input;
                this._isUTC = true;
                if (localAdjust != null) {
                    this.subtract(localAdjust, 'm');
                }
                if (offset !== input) {
                    if (!keepLocalTime || this._changeInProgress) {
                        addOrSubtractDurationFromMoment(this,
                                moment.duration(offset - input, 'm'), 1, false);
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        moment.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? 'UTC' : '';
        },

        zoneName : function () {
            return this._isUTC ? 'Coordinated Universal Time' : '';
        },

        parseZone : function () {
            if (this._tzm) {
                this.zone(this._tzm);
            } else if (typeof this._i === 'string') {
                this.zone(this._i);
            }
            return this;
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
        },

        quarter : function (input) {
            return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        week : function (input) {
            var week = this.localeData().week(this);
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        weekday : function (input) {
            var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
            return input == null ? weekday : this.add(input - weekday, 'd');
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function () {
            return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function () {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            if (typeof this[units] === 'function') {
                this[units](value);
            }
            return this;
        },

        // If passed a locale key, it will set the locale for this
        // instance.  Otherwise, it will return the locale configuration
        // variables for this instance.
        locale : function (key) {
            if (key === undefined) {
                return this._locale._abbr;
            } else {
                this._locale = moment.localeData(key);
                return this;
            }
        },

        lang : deprecate(
            "moment().lang() is deprecated. Use moment().localeData() instead.",
            function (key) {
                if (key === undefined) {
                    return this.localeData();
                } else {
                    this._locale = moment.localeData(key);
                    return this;
                }
            }
        ),

        localeData : function () {
            return this._locale;
        }
    });

    function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(),
                daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function rawGetter(mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
            return rawMonthSetter(mom, value);
        } else {
            return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    function makeAccessor(unit, keepTime) {
        return function (value) {
            if (value != null) {
                rawSetter(this, unit, value);
                moment.updateOffset(this, keepTime);
                return this;
            } else {
                return rawGetter(this, unit);
            }
        };
    }

    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    // moment.fn.month is defined separately
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate('dates accessor is deprecated. Use date instead.', makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate('years accessor is deprecated. Use year instead.', makeAccessor('FullYear', true));

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    function daysToYears (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        return days * 400 / 146097;
    }

    function yearsToDays (years) {
        // years * 365 + absRound(years / 4) -
        //     absRound(years / 100) + absRound(years / 400);
        return years * 146097 / 400;
    }

    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years = 0;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);

            // Accurately convert days to years, assume start from year 0.
            years = absRound(daysToYears(days));
            days -= absRound(yearsToDays(years));

            // 30 days to a month
            // TODO (iskren): Use anchor date (like 1st Jan) to compute this.
            months += absRound(days / 30);
            days %= 30;

            // 12 months -> 1 year
            years += absRound(months / 12);
            months %= 12;

            data.days = days;
            data.months = months;
            data.years = years;
        },

        abs : function () {
            this._milliseconds = Math.abs(this._milliseconds);
            this._days = Math.abs(this._days);
            this._months = Math.abs(this._months);

            this._data.milliseconds = Math.abs(this._data.milliseconds);
            this._data.seconds = Math.abs(this._data.seconds);
            this._data.minutes = Math.abs(this._data.minutes);
            this._data.hours = Math.abs(this._data.hours);
            this._data.months = Math.abs(this._data.months);
            this._data.years = Math.abs(this._data.years);

            return this;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var output = relativeTime(this, !withSuffix, this.localeData());

            if (withSuffix) {
                output = this.localeData().pastFuture(+this, output);
            }

            return this.localeData().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            var days, months;
            units = normalizeUnits(units);

            days = this._days + this._milliseconds / 864e5;
            if (units === 'month' || units === 'year') {
                months = this._months + daysToYears(days) * 12;
                return units === 'month' ? months : months / 12;
            } else {
                days += yearsToDays(this._months / 12);
                switch (units) {
                    case 'week': return days / 7;
                    case 'day': return days;
                    case 'hour': return days * 24;
                    case 'minute': return days * 24 * 60;
                    case 'second': return days * 24 * 60 * 60;
                    case 'millisecond': return days * 24 * 60 * 60 * 1000;
                    default: throw new Error('Unknown unit ' + units);
                }
            }
        },

        lang : moment.fn.lang,
        locale : moment.fn.locale,

        toIsoString : deprecate(
            "toIsoString() is deprecated. Please use toISOString() instead " +
            "(notice the capitals)",
            function () {
                return this.toISOString();
            }
        ),

        toISOString : function () {
            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            var years = Math.abs(this.years()),
                months = Math.abs(this.months()),
                days = Math.abs(this.days()),
                hours = Math.abs(this.hours()),
                minutes = Math.abs(this.minutes()),
                seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

            if (!this.asSeconds()) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            return (this.asSeconds() < 0 ? '-' : '') +
                'P' +
                (years ? years + 'Y' : '') +
                (months ? months + 'M' : '') +
                (days ? days + 'D' : '') +
                ((hours || minutes || seconds) ? 'T' : '') +
                (hours ? hours + 'H' : '') +
                (minutes ? minutes + 'M' : '') +
                (seconds ? seconds + 'S' : '');
        },

        localeData : function () {
            return this._locale;
        }
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationGetter(i.toLowerCase());
        }
    }

    moment.duration.fn.asMilliseconds = function () {
        return this.as('ms');
    };
    moment.duration.fn.asSeconds = function () {
        return this.as('s');
    };
    moment.duration.fn.asMinutes = function () {
        return this.as('m');
    };
    moment.duration.fn.asHours = function () {
        return this.as('h');
    };
    moment.duration.fn.asDays = function () {
        return this.as('d');
    };
    moment.duration.fn.asWeeks = function () {
        return this.as('weeks');
    };
    moment.duration.fn.asMonths = function () {
        return this.as('M');
    };
    moment.duration.fn.asYears = function () {
        return this.as('y');
    };

    /************************************
        Default Locale
    ************************************/


    // Set default locale, other locale will inherit from English.
    moment.locale('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LOCALES */

    /************************************
        Exposing Moment
    ************************************/

    function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
            return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
            globalScope.moment = deprecate(
                    'Accessing Moment through the global scope is ' +
                    'deprecated, and will be removed in an upcoming ' +
                    'release.',
                    moment);
        } else {
            globalScope.moment = moment;
        }
    }

    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    } else if (typeof define === 'function' && define.amd) {
        define('moment', function (require, exports, module) {
            if (module.config && module.config() && module.config().noGlobal === true) {
                // release the global variable
                globalScope.moment = oldGlobalMoment;
            }

            return moment;
        });
        makeGlobal(true);
    } else {
        makeGlobal();
    }
}).call(this);
// moment.js locale configuration
// locale : dutch (nl)
// author : Joris Röling : https://github.com/jjupiter

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    var monthsShortWithDots = "jan._feb._mrt._apr._mei_jun._jul._aug._sep._okt._nov._dec.".split("_"),
        monthsShortWithoutDots = "jan_feb_mrt_apr_mei_jun_jul_aug_sep_okt_nov_dec".split("_");

    return moment.defineLocale('nl', {
        months : "januari_februari_maart_april_mei_juni_juli_augustus_september_oktober_november_december".split("_"),
        monthsShort : function (m, format) {
            if (/-MMM-/.test(format)) {
                return monthsShortWithoutDots[m.month()];
            } else {
                return monthsShortWithDots[m.month()];
            }
        },
        weekdays : "zondag_maandag_dinsdag_woensdag_donderdag_vrijdag_zaterdag".split("_"),
        weekdaysShort : "zo._ma._di._wo._do._vr._za.".split("_"),
        weekdaysMin : "Zo_Ma_Di_Wo_Do_Vr_Za".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD-MM-YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: '[vandaag om] LT',
            nextDay: '[morgen om] LT',
            nextWeek: 'dddd [om] LT',
            lastDay: '[gisteren om] LT',
            lastWeek: '[afgelopen] dddd [om] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "over %s",
            past : "%s geleden",
            s : "een paar seconden",
            m : "één minuut",
            mm : "%d minuten",
            h : "één uur",
            hh : "%d uur",
            d : "één dag",
            dd : "%d dagen",
            M : "één maand",
            MM : "%d maanden",
            y : "één jaar",
            yy : "%d jaar"
        },
        ordinal : function (number) {
            return number + ((number === 1 || number === 8 || number >= 20) ? 'ste' : 'de');
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM YYYY'); };
moment.fn.longDate = function(){ return this.format('D MMMM YYYY H:mm'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
