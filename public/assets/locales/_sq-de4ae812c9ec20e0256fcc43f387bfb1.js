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
MessageFormat.locale.sq = function ( n ) {
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
r += "There ";
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
r += "is <a href='/unread'>1 unread</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "are <a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " unread</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["sq"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += " <a href='/new'>1 new</a> topic";
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
r += "are ";
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
})() + " new</a> topics";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["sq"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " remaining, or ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "browse other topics in ";
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
r += "This topic has ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 reply";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " replies";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["sq"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "with a high like to post ratio";
return r;
},
"med" : function(d){
var r = "";
r += "with a very high like to post ratio";
return r;
},
"high" : function(d){
var r = "";
r += "with an extremely high like to post ratio";
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
}});I18n.translations = {"sq":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Bytes"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1o","other":"%{count}o"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1v","other":"%{count}v"},"over_x_years":{"one":"\u003e 1v","other":"\u003e %{count}v"},"almost_x_years":{"one":"1v","other":"%{count}v"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 min","other":"%{count} mins"},"x_hours":{"one":"1 orë","other":"%{count} orë"},"x_days":{"one":"1 ditë","other":"%{count} ditë"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"one":"1 min më parë","other":"%{count} min më parë"},"x_hours":{"one":"1 orë më parë","other":"%{count} orë më parë"},"x_days":{"one":"1 ditë më parë","other":"%{count} ditë më parë"}},"later":{"x_days":{"one":"1 day later","other":"%{count} days later"},"x_months":{"one":"1 month later","other":"%{count} months later"},"x_years":{"one":"1 year later","other":"%{count} years later"}}},"share":{"topic":"shpërnda një lidhje tek kjo temë","post":"postim #%{postNumber}","close":"mbylle","twitter":"shpërndaje këtë lidhe në Twitter","facebook":"shpërndaje këtë lidhje ne Facebook","google+":"shpërndaje këtë lidhje në Google+","email":"dërgo këtë lidhje me email"},"topic_admin_menu":"topic admin actions","emails_are_disabled":"All outgoing email has been globally disabled by an administrator. No email notifications of any kind will be sent.","edit":"redakto titullin dhe kategorinë e kësaj teme","not_implemented":"Kjo veçori nuk është implementuar akoma, na vjen keq!","no_value":"Jo","yes_value":"Po","generic_error":"Na vjen keq, por sapo ndodhi një gabim.","generic_error_with_reason":"U shfaq një gabim: %{error}","sign_up":"Regjistrohu","log_in":"Identifikohu","age":"Mosha","joined":"Anëtarësuar","admin_title":"Admin","flags_title":"Flags","show_more":"trego më shumë","links":"Lidhjet","links_lowercase":{"one":"lidhje","other":"lidhje"},"faq":"Pyetje","guidelines":"Udhëzimet","privacy_policy":"Politika e Privatësis","privacy":"Privatësia","terms_of_service":"Kushtet e Shërbimit","mobile_view":"Pamja Mobile","desktop_view":"Pamja Desktop","you":"Ju","or":"ose","now":"tani","read_more":"lexo më shumë","more":"Më shumë","less":"Më pak","never":"asnjëher","daily":"ditore","weekly":"javore","every_two_weeks":"çdo dy javë","every_three_days":"çdo 3 ditë","max_of_count":"max i {{count}}","alternation":"ose","character_count":{"one":"{{count}} karakter","other":"{{count}} karakterë"},"suggested_topics":{"title":"Temat e Sugjeruara"},"about":{"simple_title":"Rreth","title":"Rreth %{title}","stats":"Statistikat e faqjes","our_admins":"Stafi Jonë","our_moderators":"Moderatorët Tanë","stat":{"all_time":"Gjithë Kohës","last_7_days":"7 Ditët e Fundit","last_30_days":"30 Ditët e Fundit"},"like_count":"Pëlqime","topic_count":"Tema","post_count":"Postime","user_count":"Anëtarët e Rinjë","active_user_count":"Anëtarë Aktivë","contact":"Kontaktoni","contact_info":"In the event of a critical issue or urgent matter affecting this site, please contact us at %{contact_info}."},"bookmarked":{"title":"Të Preferuarat","clear_bookmarks":"Pastro Bookmarks","help":{"bookmark":"Click to bookmark the first post on this topic","unbookmark":"Click to remove all bookmarks in this topic"}},"bookmarks":{"not_logged_in":"ju duhet të jeni të identifikuar për të ruajtur temën.","created":"ju ruajtët këtë temë","not_bookmarked":"e keni lexuar këtë temë; kliko për ta ruajtur","last_read":"this is the last post you've read; click to bookmark it","remove":"Hiq Preferencën","confirm_clear":"Are you sure you want to clear all the bookmarks from this topic?"},"topic_count_latest":{"one":"{{count}} new or updated topic.","other":"{{count}} new or updated topics."},"topic_count_unread":{"one":"{{count}} temë e palexuar.","other":"{{count}} tema të palexuara."},"topic_count_new":{"one":"{{count}} new topic.","other":"{{count}} new topics."},"click_to_show":"Kliko për ti shfaqur.","preview":"shiko","cancel":"anulo","save":"Ruaj Ndryshimet","saving":"Duke e ruajtur...","saved":"U ruajt!","upload":"Ngarko","uploading":"Duke nga ngarkuar...","uploaded":"U ngarkua!","enable":"Aktivizo","disable":"Disaktivizo","undo":"Zhbëj","revert":"Rikthe","failed":"Dështojë","switch_to_anon":"Mënyrë Anonime","banner":{"close":"Hiq këtë reklamë.","edit":"Edit this banner \u003e\u003e"},"choose_topic":{"none_found":"Asnjë temë u gjet.","title":{"search":"Kërko për një Temë sipas emrit, adresës apo id:","placeholder":"shkruaj titullin e temës këtu"}},"queue":{"topic":"Temë:","approve":"Approve","reject":"Rifiuto","delete_user":"Fshij Anëtarë","title":"Kërkohet Aprovim","none":"There are no posts to review.","edit":"Redakto","cancel":"Anulo","view_pending":"shiko postimet pezull","has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval","other":"This topic has \u003cb\u003e{{count}}\u003c/b\u003e posts awaiting approval"},"confirm":"Ruaj ndryshimet","delete_prompt":"Are you sure you want to delete \u003cb\u003e%{username}\u003c/b\u003e? This will remove all of their posts and block their email and ip address.","approval":{"title":"Post Needs Approval","description":"We've received your new post but it needs to be approved by a moderator before it will appear. Please be patient.","pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending.","other":"You have \u003cstrong\u003e{{count}}\u003c/strong\u003e posts pending."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e postoj \u003ca href='{{topicUrl}}'\u003etemën\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eJu\u003c/a\u003e postuat \u003ca href='{{topicUrl}}'\u003etemën\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e u përgjigj tek \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eJu\u003c/a\u003e jeni përgjigjur tek \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e u përgjigj tek \u003ca href='{{topicUrl}}'\u003etema\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eJu\u003c/a\u003e jeni përgjigjur tek \u003ca href='{{topicUrl}}'\u003etema\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e ju citoj \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e ju ka cituar \u003ca href='{{user2Url}}'\u003eju\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eJu\u003c/a\u003e keni cituar \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Postuar nga \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Postuar nga \u003ca href='{{userUrl}}'\u003eju\u003c/a\u003e","sent_by_user":"Dërguar nga \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Dërguar nga \u003ca href='{{userUrl}}'\u003eju\u003c/a\u003e"},"directory":{"filter_name":"filter by username","title":"Users","likes_given":"Dhënë","likes_received":"Marrë","topics_entered":"Entered","topics_entered_long":"Topics Entered","time_read":"Koha e Leximit","topic_count":"Tema","topic_count_long":"Topics Created","post_count":"Përgjigje","post_count_long":"Replies Posted","no_results":"No results were found.","days_visited":"Vizita","days_visited_long":"Vizita Ditore","posts_read":"Lexuar","posts_read_long":"Posts Read","total_rows":{"one":"1 user","other":"%{count} users"}},"groups":{"visible":"Grupi është i dukshëm për të gjithë përdoruesit","title":{"one":"grupë","other":"grupet"},"members":"Anëtarë","posts":"Postime","alias_levels":{"title":"Kush mund ta përdori këtë grup si një nofkë?","nobody":"Asnjëri","only_admins":"Vetëm adminët","mods_and_admins":"Vetëm moderatorët dhe Adminët","members_mods_and_admins":"Vetëm anëtarët e grupit, moderatorët dhe administratorët","everyone":"Të gjithë"}},"user_action_groups":{"1":"Pëlqime të Dhëna","2":"Pëlqime të marra","3":"Të Preferuarat","4":"Tema","5":"Përgjigje","6":"Responses","7":"Përmendje","9":"Citim","10":"Shënuar","11":"Redaktuar","12":"Sent Items","13":"Inbox","14":"Në pritje"},"categories":{"all":"shfaq kategoritë","all_subcategories":"të gjitha","no_subcategory":"asnjë","category":"Kategori","posts":"Postime","topics":"Tema","latest":"Të fundit","latest_by":"të fundit sipas","toggle_ordering":"toggle ordering control","subcategories":"Nënkategori","topic_stats":"Numri i temave të reja.","topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}.","other":"%{count} new topics in the past %{unit}."},"post_stats":"Numri i postimeve te ri.","post_stat_sentence":{"one":"%{count} new post in the past %{unit}.","other":"%{count} new posts in the past %{unit}."}},"ip_lookup":{"title":"Shiko Adresën IP","hostname":"Emri Hostit","location":"Vendndodhja","location_not_found":"(i panjohur)","organisation":"Organizata","phone":"Telefoni","other_accounts":"Other accounts with this IP address:","delete_other_accounts":"Fshij %{count}","username":"pseudonimi","trust_level":"TL","read_time":"koha e leximit","topics_entered":"topics entered","post_count":"# postimeve","confirm_delete_other_accounts":"Are you sure you want to delete these accounts?"},"user_fields":{"none":"(select an option)"},"user":{"said":"{{username}}:","profile":"Profili","mute":"Mute","edit":"Ndrysho Preferencat","download_archive":"Download My Posts","new_private_message":"Mesazh i Ri","private_message":"Mesazh","private_messages":"Mesazhet","activity_stream":"Aktiviteti","preferences":"Preferencat","bookmarks":"Të Preferuarat","bio":"Rreth meje","invited_by":"Të ftuar nga unë","trust_level":"Niveli Besimit","notifications":"Njoftimet","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_default":"Turn On Notifications","perm_denied_btn":"Permission Denied","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","disable":"Disable Notifications","currently_enabled":"(currently enabled)","enable":"Enable Notifications","currently_disabled":"(currently disabled)","each_browser_note":"Note: You have to change this setting on every browser you use."},"dismiss_notifications":"Shënoj të gjitha si të lexuara","dismiss_notifications_tooltip":"Shëno njoftimet e palexuara si të lexuara","disable_jump_reply":"Don't jump to my post after I reply","dynamic_favicon":"Show new / updated topic count on browser icon","edit_history_public":"Lejo anëtarët e tjerë të shikojnë redaktimet e mia ","external_links_in_new_tab":"Hap të gjitha lidhjet e jashtme në një tab të ri","enable_quoting":"Aktivizo citimin në përgjigje për tekstin e përzgjedhur","change":"ndrysho","moderator":"{{user}} është një moderator","admin":"{{user}} është një admin","moderator_tooltip":"Ky anëtar është një moderator","admin_tooltip":"Ky anëtar është administrator","blocked_tooltip":"This user is blocked","suspended_notice":"Ky anëtarë është përjashtuar deri më {{date}}.","suspended_reason":"Arsyeja:","github_profile":"Github","mailing_list_mode":"Send me an email for every new post (unless I mute the topic or category)","watched_categories":"Shikuar","watched_categories_instructions":"You will automatically watch all new topics in these categories. You will be notified of all new posts and topics, and a count of new posts will also appear next to the topic.","tracked_categories":"Gjurmuar","tracked_categories_instructions":"You will automatically track all new topics in these categories. A count of new posts will appear next to the topic.","muted_categories":"Heshtur","delete_account":"Fshi Llogarin Time","delete_account_confirm":"Are you sure you want to permanently delete your account? This action cannot be undone!","deleted_yourself":"Llogaria juaj u fshi me sukses.","delete_yourself_not_allowed":"You cannot delete your account right now. Contact an admin to do delete your account for you.","unread_message_count":"Mesazhet","admin_delete":"Fshij","users":"Users","muted_users":"Muted","muted_users_instructions":"Suppress all notifications from these users.","staff_counters":{"flags_given":"helpful flags","flagged_posts":"postimet e raportuara","deleted_posts":"fshi postimet","suspensions":"pezullimet","warnings_received":"paralajmërimet"},"messages":{"all":"Të gjithë","mine":"Mine","unread":"Palexuar"},"change_password":{"success":"(email u dërgua)","in_progress":"(duke dërguar emailin)","error":"(gabim)","action":"Dërgo email për të rivendosur Fjalëkalimin","set_password":"Vendos Fjalëkalim"},"change_about":{"title":"Ndrysho Rreth Meje","error":"There was an error changing ths value."},"change_username":{"title":"Ndrysho Pseudonimin","confirm":"Nëse ndryshoni emrin, të gjithë postimet e cituara tek duke përfolur @emri  nuk do të punojnë. Jeni të sigurte që doni ta aprovoni?","taken":"Na vjen keq, por ky emër është i zënë.","error":"Ndodhi një gabim gjatë ndryshimit të emrit.","invalid":"Pseudonimi nuk është i vlefshëm. Duhet të përmbaje vetëm shkronja ose numra"},"change_email":{"title":"Ndrysho Email","taken":"Na vjen keq, por ky email nuk është i disponueshëm.","error":"Hasëm një gabim gjatë ndryshimit të adresës email. Mos vallë është në përdorim nga dikush tjetër?","success":"Ju dërguam një email tek adresa që shkruajtët. Ju ftojmë të ndiqni udhëzimet e konfirmimit."},"change_avatar":{"title":"Ndrysho fotografinë e profilit","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, bazur në","gravatar_title":"Change your avatar on Gravatar's website","refresh_gravatar_title":"Rifresko Gravatar tuaj","letter_based":"System assigned profile picture","uploaded_avatar":"Foto personalizuar","uploaded_avatar_empty":"Shto një foto të personalizuar","upload_title":"Ngarni foton tuaj","upload_picture":"Ngarko Foto","image_is_not_a_square":"Warning: we've cropped your image; width and height were not equal.","cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"change_profile_background":{"title":"Sfondi Profilit","instructions":"Sfondi profilit do të vendoset në qendër dhe do të ketë një gjerësi prej 850px."},"change_card_background":{"title":"Sfondi për Skedën Anëtarit","instructions":"Sfondi profilit do të vendoset në qendër dhe do të ketë një gjerësi prej 590px."},"email":{"title":"Email","instructions":"Never shown to the public","ok":"We will email you to confirm","invalid":"Please enter a valid email address","authenticated":"Your email has been authenticated by {{provider}}"},"name":{"title":"Emri","instructions":"Emri i Plotë (fakultativ)","instructions_required":"Emri i plotë","too_short":"Emri juaj është shumë i shkurtër","ok":"Emri duket në rregull"},"username":{"title":"Pseudonimi","instructions":"Unik, pa hapësira, i shkurtër","short_instructions":"People can mention you as @{{username}}","available":"Emri është i disponueshëm","global_match":"Email matches the registered username","global_mismatch":"Jeni vallë regjistruar më parë. Provo {{suggestion}}?","not_available":"Nuk është i disponueshëm. Provo {{suggestion}}?","too_short":"Emri juaj është shumë i shkurtër","too_long":"Emri juaj është shumë i gjatë","checking":"Duke kontrolluar disponibilitetin e pseudonimit....","enter_email":"Username found; enter matching email","prefilled":"Email matches this registered username"},"locale":{"title":"Gjuha e faqes","instructions":"User interface language. It will change when you refresh the page.","default":"(paracaktuar)"},"password_confirmation":{"title":"Rishkruaj Fjalëkalimin"},"last_posted":"Postimi Fundit","last_emailed":"Emaili Fundit","last_seen":"Parë","created":"Regjistruar","log_out":"Dilni","location":"Pozicioni","card_badge":{"title":"Card Badge Anëtarit"},"website":"Web Site","email_settings":"Email","email_digests":{"title":"When I don't visit here, send an email digest of what's new:","daily":"ditore","every_three_days":"çdo 3 ditë","weekly":"javore","every_two_weeks":"çdo 2 javë"},"email_direct":"Send me an email when someone quotes me, replies to my post, mentions my @username, or invites me to a topic","email_private_messages":"Send me an email when someone messages me","email_always":"Send me email notifications even when I am active on the site","other_settings":"Tjetër","categories_settings":"Kategoritë","new_topic_duration":{"label":"Konsidero diskutim te ri kur","not_viewed":"I haven't viewed them yet","last_here":"created since I was here last"},"auto_track_topics":"Automatically track topics I enter","auto_track_options":{"never":"asnjëherë","immediately":"menjëherë"},"invited":{"search":"shkruaj për të kërkuar ftesat...","title":"Ftesa","user":"Anëtarët e Ftuar","redeemed":"Ridërgo ftesat","redeemed_tab":"Redeemed","redeemed_at":"Redeemed","pending":"Ftesat e Pezulluara","pending_tab":"Pending","topics_entered":"Diskutimet e Para","posts_read_count":"Postimet e Lexuara","expired":"Kjo ftesa ka skaduar.","rescind":"Hiq","rescinded":"Ftesa u hoq","reinvite":"Ridërgo Ftesën","reinvited":"Ftesa u ri-dërgua","time_read":"Koha e Leximit","days_visited":"Days Visited","account_age_days":"Account age in days","create":"Dërgo një ftesë","bulk_invite":{"none":"Ju nuk keni ftuar askënd deri tani. Mund të dërgoni ftesa individuale ose mund të ftoni një grup personash duke \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003engarkuar skedarin\u003c/a\u003e.","text":"Skedari për Ftesat në Grup","uploading":"Duke ngarkuar...","success":"File uploaded successfully, you will be notified via message when the process is complete.","error":"There was an error uploading '{{filename}}': {{message}}"}},"password":{"title":"Fjalëkalimi","too_short":"Fjalëkalimi është shumë i shkurër.","common":"Ky fjalëkalim është shumë i përdorur.","same_as_username":"Fjalëkalimi është i njëjtë me pseudonimin.","same_as_email":"Your password is the same as your email.","ok":"Fjalëkalimi është i pranueshëm.","instructions":"Të paktën %{count} karaktere."},"associated_accounts":"Logins","ip_address":{"title":"Adresa IP e Fundit"},"registration_ip_address":{"title":"Adresa IP e rregjistrimit"},"avatar":{"title":"Foto Profilit","header_title":"profile, messages, bookmarks and preferences"},"title":{"title":"Titulli"},"filters":{"all":"Të Gjithë"},"stream":{"posted_by":"Postuar nga","sent_by":"Dërgura nga","private_message":"mesazh","the_topic":"tema"}},"loading":"Duke ngarkuar...","errors":{"prev_page":"while trying to load","reasons":{"network":"Gabim në rrjet","server":"Gabim në Server","forbidden":"Ndalohet Hyrja","unknown":"Gabim"},"desc":{"network":"Ju lutemi, kontrolloni lidhjen me Internetin.","network_fixed":"Duket sikur u ktheve.","server":"Kodi Gabimit: {{status}}","forbidden":"You're not allowed to view that.","unknown":"Diçka shkoj keq."},"buttons":{"back":"Shko Mbrapa","again":"Provoje Përsëri","fixed":"Ngarko Faqen"}},"close":"Mbyll","assets_changed_confirm":"Faqja u azhurnuar. Rifreskojeni tani për versionin e fundit.","logout":"Ju jeni shkëputur!","refresh":"Rifresko","read_only_mode":{"enabled":"Read-only mode is enabled. You can continue to browse the site but interactions may not work.","login_disabled":"Login is disabled while the site is in read only mode."},"learn_more":"mëso më shumë...","year":"vit","year_desc":"temat e krijuara në 365 ditët e fundit","month":"muaj","month_desc":"temat e krijuara në 30 ditët e fundit","week":"javë","week_desc":"temat e krijuara në 7 ditët e fundit","day":"dit","first_post":"Postimi parë","mute":"Mute","unmute":"Unmute","last_post":"Postimi fundit","last_reply_lowercase":"përgjigja fundit","replies_lowercase":{"one":"përgjigje","other":"përgjigje"},"summary":{"enabled_description":"You're viewing a summary of this topic: the most interesting posts as determined by the community.","description":"Janë \u003cb\u003e{{count}}\u003c/b\u003e përgjigje.","description_time":"There are \u003cb\u003e{{count}}\u003c/b\u003e replies with an estimated read time of \u003cb\u003e{{readingTime}} minutes\u003c/b\u003e.","enable":"Përmbidhë këtë Diskutim","disable":"Shfaq të gjithë Postimet"},"deleted_filter":{"enabled_description":"This topic contains deleted posts, which have been hidden. ","disabled_description":"Deleted posts in the topic are shown.","enable":"Fsheh Postimet e Eliminuara","disable":"Show Deleted Posts"},"private_message_info":{"title":"Mesazh","invite":"Fto të tjerët...","remove_allowed_user":"Do you really want to remove {{name}} from this message?"},"email":"Email","username":"Username","last_seen":"Parë","created":"Krijuar","created_lowercase":"krijuar","trust_level":"Niveli Besimit","search_hint":"username, email or IP address","create_account":{"title":"Krijo një Llogari të Re","failed":"Something went wrong, perhaps this email is already registered, try the forgot password link"},"forgot_password":{"title":"Rivendos Fjalëkalimin","action":"Kam harruar fjalëkalimin","invite":"Enter your username or email address, and we'll send you a password reset email.","reset":"Rivendos Fjalëkalimin","complete_username":"If an account matches the username \u003cb\u003e%{username}\u003c/b\u003e, you should receive an email with instructions on how to reset your password shortly.","complete_email":"If an account matches \u003cb\u003e%{email}\u003c/b\u003e, you should receive an email with instructions on how to reset your password shortly.","complete_username_found":"We found an account that matches the username \u003cb\u003e%{username}\u003c/b\u003e, you should receive an email with instructions on how to reset your password shortly.","complete_email_found":"We found an account that matches \u003cb\u003e%{email}\u003c/b\u003e, you should receive an email with instructions on how to reset your password shortly.","complete_username_not_found":"No account matches the username \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"No account matches \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Identifikohu","username":"User","password":"Fjalëkalimi","email_placeholder":"email ose emri","caps_lock_warning":"Caps Lock është aktive","error":"Gabim i panjohur","rate_limit":"Please wait before trying to log in again.","blank_username_or_password":"Ju lutem, shkruani adresën email ose pseudonim dhe fjalëkalimin.","reset_password":"Rivendos Fjalëkalimin","logging_in":"Duke u Identifikuar...","or":"Ose","authenticating":"Duke u Autorizuar...","awaiting_confirmation":"Your account is awaiting activation, use the forgot password link to issue another activation email.","awaiting_approval":"Your account has not been approved by a staff member yet. You will be sent an email when it is approved.","requires_invite":"Sorry, access to this forum is by invite only.","not_activated":"You can't log in yet. We previously sent an activation email to you at \u003cb\u003e{{sentTo}}\u003c/b\u003e. Please follow the instructions in that email to activate your account.","not_allowed_from_ip_address":"You can't login from that IP address.","admin_not_allowed_from_ip_address":"You can't log in as admin from that IP address.","resend_activation_email":"Click here to send the activation email again.","sent_activation_email_again":"We sent another activation email to you at \u003cb\u003e{{currentEmail}}\u003c/b\u003e. It might take a few minutes for it to arrive; be sure to check your spam folder.","google":{"title":"me Google","message":"Authenticating with Google (make sure pop up blockers are not enabled)"},"google_oauth2":{"title":"me Google","message":"Authenticating with Google (make sure pop up blockers are not enabled)"},"twitter":{"title":"me Twitter","message":"Authenticating with Twitter (make sure pop up blockers are not enabled)"},"facebook":{"title":"me Facebook","message":"Authenticating with Facebook (make sure pop up blockers are not enabled)"},"yahoo":{"title":"me Yahoo","message":"Authenticating with Yahoo (make sure pop up blockers are not enabled)"},"github":{"title":"me GitHub","message":"Authenticating with GitHub (make sure pop up blockers are not enabled)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","composer":{"emoji":"Emoji :smile:","add_warning":"This is an official warning.","posting_not_on_topic":"Which topic do you want to reply to?","saving_draft_tip":"duke e ruajtur...","saved_draft_tip":"ruajtur","saved_local_draft_tip":"saved locally","similar_topics":"Tema juaj është e ngjashme me...","drafts_offline":"drafts offline","error":{"title_missing":"Titulli është i nevojshëm","title_too_short":"Title must be at least {{min}} characters","title_too_long":"Title can't be more than {{max}} characters","post_missing":"Postimi s'mund të jetë bosh","post_length":"Post must be at least {{min}} characters","try_like":"Have you tried the \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e button?","category_missing":"You must choose a category"},"save_edit":"Save Edit","reply_original":"Reply on Original Topic","reply_here":"Përgjigju Këtu","reply":"Përgjigju","cancel":"Anulo","create_topic":"Fillo Diskutim","create_pm":"Mesazh","title":"Ose shtyp Ctrl+Enter","users_placeholder":"Shto Anëtar","title_placeholder":"What is this discussion about in one brief sentence?","edit_reason_placeholder":"pse jeni duke e redaktuar?","show_edit_reason":"(arsye redaktimit)","view_new_post":"Shikoni postimin tuaj te ri.","saved":"U Ruajt!","saved_draft":"Post draft in progress. Select to resume.","uploading":"Duke nga ngarkuar...","show_preview":"show preview \u0026raquo;","hide_preview":"\u0026laquo; hide preview","quote_post_title":"Quote whole post","bold_title":"Theksuar","bold_text":"tekst i theksuar","italic_title":"Emphasis","italic_text":"emphasized text","link_title":"Lidhje","link_description":"shkruaj përshkrimin e lidhjes këtu","link_dialog_title":"Vendos Lidhje","link_optional_text":"titull opsional","quote_title":"Citim","quote_text":"Blockquote","code_title":"Preformatted text","code_text":"indent preformatted text by 4 spaces","upload_title":"Ngarko","upload_description":"enter upload description here","olist_title":"List e Numëruar","ulist_title":"Bulleted List","list_item":"List item","heading_title":"Heading","heading_text":"Heading","hr_title":"Horizontal Rule","help":"Markdown Editing Help","toggler":"hide or show the composer panel","admin_options_title":"Optional staff settings for this topic","auto_close":{"label":"Auto-close topic time:","error":"Please enter a valid value.","based_on_last_post":"Don't close until the last post in the topic is at least this old.","all":{"examples":"Enter number of hours (24), absolute time (17:30) or timestamp (2013-11-22 14:00)."},"limited":{"units":"(# i orëve)","examples":"Enter number of hours (24)."}}},"notifications":{"title":"notifications of @name mentions, replies to your posts and topics, messages, etc","none":"Unable to load notifications at this time.","more":"shiko njoftimet e kaluara","total_flagged":"totali postimeve të sinjalizuar","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eEarned '{{description}}'\u003c/p\u003e","popup":{"mentioned":"{{username}} mentioned you in \"{{topic}}\" - {{site_title}}","quoted":"{{username}} quoted you in \"{{topic}}\" - {{site_title}}","replied":"{{username}} replied to you in \"{{topic}}\" - {{site_title}}","posted":"{{username}} posted in \"{{topic}}\" - {{site_title}}","private_message":"{{username}} sent you a private message in \"{{topic}}\" - {{site_title}}","linked":"{{username}} linked to your post from \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Shto një imazh","title_with_attachments":"Shto një imazh ose një skedarë","from_my_computer":"Nga çdo paisje","from_the_web":"Nga web","remote_tip":"lidhje tek imazhi","local_tip":"select images from your device","hint":"(you can also drag \u0026 drop into the editor to upload them)","uploading":"Duke ngarkaur","select_file":"Select File","image_link":"link your image will point to"},"search":{"title":"search topics, posts, users, or categories","no_results":"Nuk i gjet asnjë rezultat.","no_more_results":"No more results found.","search_help":"Search help","searching":"Duke kërkuar...","post_format":"#{{post_number}} by {{username}}","context":{"user":"Kërko postime nga @{{username}}","category":"Kërko tek kategoria \"{{category}}\"","topic":"Kërko tek kjo temë","private_messages":"Search messages"}},"go_back":"kthehu mbrapa","not_logged_in_user":"user page with summary of current activity and preferences","current_user":"go to your user page","topics":{"bulk":{"reset_read":"Reseto Leximet","delete":"Delete Topics","dismiss_new":"Dismiss New","toggle":"toggle bulk selection of topics","actions":"Bulk Actions","change_category":"Ndrysho Kategori","close_topics":"Myll Diskutim","archive_topics":"Archive Topics","notification_level":"Ndrysho Nivelin e Njoftimeve","choose_new_category":"Choose the new category for the topics:","selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic.","other":"You have selected \u003cb\u003e{{count}}\u003c/b\u003e topics."}},"none":{"unread":"Nuk keni tema të palexuara.","new":"Nuk ka tema të reja.","read":"Nuk keni lexuar asnjë temë deri tani.","posted":"Nuk keni shkruajtur tek asnjë temë deri tani.","latest":"Nuk ka tema të fundit. Hm sa keq.","hot":"Nuk tema të populluara.","bookmarks":"You have no bookmarked topics yet.","category":"Nuk ka {{category}} tema.","top":"Nuk ka tema të populluara.","search":"There are no search results.","educate":{"new":"\u003cp\u003eYour new topics appear here.\u003c/p\u003e\u003cp\u003eBy default, topics are considered new and will show a \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enew\u003c/span\u003e indicator if they were created in the last 2 days.\u003c/p\u003e\u003cp\u003eYou can change this in your \u003ca href=\"%{userPrefsUrl}\"\u003epreferences\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eYour unread topics appear here.\u003c/p\u003e\u003cp\u003eBy default, topics are considered unread and will show unread counts \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e if you:\u003c/p\u003e\u003cul\u003e\u003cli\u003eCreated the topic\u003c/li\u003e\u003cli\u003eReplied to the topic\u003c/li\u003e\u003cli\u003eRead the topic for more than 4 minutes\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOr if you have explicitly set the topic to Tracked or Watched via the notification control at the bottom of each topic.\u003c/p\u003e\u003cp\u003eYou can change this in your \u003ca href=\"%{userPrefsUrl}\"\u003epreferences\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Nuk ka më tema së fundmi.","hot":"Nuk ka më tema të populluara.","posted":"Nuk ka më tema të publikuara.","read":"Nuk ka më tema për të lexuar.","new":"Nuk ka më tema të reja.","unread":"Nuk ka më tema të palexuara.","category":"Nuk ka me tema nga {{category}}.","top":"Nuk ka më tema të populluara","bookmarks":"There are no more bookmarked topics.","search":"There are no more search results."}},"topic":{"filter_to":"{{post_count}} posts in topic","create":"Temë e Re","create_long":"Fillo një Diskutim të Ri","private_message":"Start a message","list":"Tema","new":"temë e re","unread":"unread","new_topics":{"one":"1 new topic","other":"{{count}} new topics"},"unread_topics":{"one":"1 unread topic","other":"{{count}} unread topics"},"title":"Temë","invalid_access":{"title":"Tema është private","description":"Sorry, you don't have access to that topic!","login_required":"You need to log in to see that topic."},"server_error":{"title":"Topic failed to load","description":"Sorry, we couldn't load that topic, possibly due to a connection problem. Please try again. If the problem persists, let us know."},"not_found":{"title":"Tema nuk u gjet","description":"Sorry, we couldn't find that topic. Perhaps it was removed by a moderator?"},"total_unread_posts":{"one":"you have 1 unread post in this topic","other":"you have {{count}} unread posts in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic","other":"you have {{count}} unread old posts in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it","other":"there are {{count}} new posts in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic","other":"there are {{count}} likes in this topic"},"back_to_list":"Kthehu tek Lista e Temave","options":"Opsionet e Temës","show_links":"show links within this topic","toggle_information":"toggle topic details","read_more_in_category":"Dëshironi të lexoni të tjera? Shfleto temat në {{catLink}} ose {{latestLink}}.","read_more":"Dëshironi të lexoni të tjera? {{catLink}} ose {{latestLink}}.","browse_all_categories":"Browse all categories","view_latest_topics":"shiko temat e fundit","suggest_create_topic":"Pse nuk filloni një diskutim?","jump_reply_up":"jump to earlier reply","jump_reply_down":"jump to later reply","deleted":"The topic has been deleted","auto_close_notice":"This topic will automatically close %{timeLeft}.","auto_close_notice_based_on_last_post":"This topic will close %{duration} after the last reply.","auto_close_title":"Auto-Close Settings","auto_close_save":"Ruaj","auto_close_remove":"Don't Auto-Close This Topic","progress":{"title":"progresi temës","go_top":"sipër","go_bottom":"poshtë","go":"shko","jump_bottom":"jump to last post","jump_bottom_with_number":"jump to post %{post_number}","total":"totali postimeve","current":"postimi aktual","position":"tema %{current} e %{total}"},"notifications":{"reasons":{"3_6":"You will receive notifications because you are watching this category.","3_5":"You will receive notifications because you started watching this topic automatically.","3_2":"You will receive notifications because you are watching this topic.","3_1":"You will receive notifications because you created this topic.","3":"You will receive notifications because you are watching this topic.","2_8":"You will receive notifications because you are tracking this category.","2_4":"You will receive notifications because you posted a reply to this topic.","2_2":"You will receive notifications because you are tracking this topic.","2":"You will receive notifications because you \u003ca href=\"/users/{{username}}/preferences\"\u003eread this topic\u003c/a\u003e.","1_2":"You will be notified if someone mentions your @name or replies to you.","1":"You will be notified if someone mentions your @name or replies to you.","0_7":"You are ignoring all notifications in this category.","0_2":"You are ignoring all notifications on this topic.","0":"You are ignoring all notifications on this topic."},"watching_pm":{"title":"Watching","description":"You will be notified of every new reply in this message, and a count of new replies will be shown."},"watching":{"title":"Në vëzhgim","description":"You will be notified of every new reply in this topic, and a count of new replies will be shown."},"tracking_pm":{"title":"Tracking","description":"A count of new replies will be shown for this message. You will be notified if someone mentions your @name or replies to you."},"tracking":{"title":"Tracking","description":"A count of new replies will be shown for this topic. You will be notified if someone mentions your @name or replies to you. "},"regular":{"description":"You will be notified if someone mentions your @name or replies to you."},"regular_pm":{"description":"You will be notified if someone mentions your @name or replies to you."},"muted_pm":{"title":"Muted","description":"You will never be notified of anything about this message."},"muted":{"title":"Muted"}},"actions":{"recover":"Un-Delete Topic","delete":"Fshi Diskutimin","open":"Fillo Diskutim","close":"Mbyll Diskutimin","multi_select":"Select Posts…","auto_close":"Auto Close…","pin":"Pin Topic…","unpin":"Un-Pin Topic…","unarchive":"Unarchive Topic","archive":"Archive Topic","invisible":"Make Unlisted","visible":"Make Listed","reset_read":"Reset Read Data"},"feature":{"pin":"Pin Topic","unpin":"Un-Pin Topic","pin_globally":"Pin Topic Globally","make_banner":"Banner Topic","remove_banner":"Remove Banner Topic"},"reply":{"title":"Përgjigju","help":"shkruaj një përgjigje tek ky diskutim"},"clear_pin":{"title":"Clear pin","help":"Clear the pinned status of this topic so it no longer appears at the top of your topic list"},"share":{"title":"Shpërndaje","help":"share a link to this topic"},"flag_topic":{"title":"Flag","help":"privately flag this topic for attention or send a private notification about it","success_message":"You successfully flagged this topic."},"feature_topic":{"title":"Feature this topic","pin":"Make this topic appear at the top of the {{categoryLink}} category until","confirm_pin":"You already have {{count}} pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic in this category?","unpin":"Remove this topic from the top of the {{categoryLink}} category.","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Users can unpin the topic individually for themselves.","pin_globally":"Make this topic appear at the top of all topic lists until","confirm_pin_globally":"You already have {{count}} globally pinned topics. Too many pinned topics may be a burden for new and anonymous users. Are you sure you want to pin another topic globally?","unpin_globally":"Remove this topic from the top of all topic lists.","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Users can unpin the topic individually for themselves.","make_banner":"Make this topic into a banner that appears at the top of all pages.","remove_banner":"Remove the banner that appears at the top of all pages.","banner_note":"Users can dismiss the banner by closing it. Only one topic can be bannered at any given time."},"inviting":"Inviting...","automatically_add_to_groups_optional":"This invite also includes access to these groups: (optional, admin only)","automatically_add_to_groups_required":"This invite also includes access to these groups: (\u003cb\u003eRequired\u003c/b\u003e, admin only)","invite_private":{"title":"Invite to Message","email_or_username":"Invitee's Email or Username","email_or_username_placeholder":"email address or username","action":"Fto","success":"We've invited that user to participate in this message.","error":"Sorry, there was an error inviting that user.","group_name":"emri grupit"},"invite_reply":{"title":"Ftesa","username_placeholder":"username","action":"Dërgo Ftesa","help":"invite others to this topic via email or notifications","to_forum":"We'll send a brief email allowing your friend to immediately join by clicking a link, no login required.","sso_enabled":"Enter the username of the person you'd like to invite to this topic.","to_topic_blank":"Enter the username or email address of the person you'd like to invite to this topic.","to_topic_email":"You've entered an email address. We'll email an invitation that allows your friend to immediately reply to this topic.","to_topic_username":"You've entered a username. We'll send a notification with a link inviting them to this topic.","to_username":"Enter the username of the person you'd like to invite. We'll send a notification with a link inviting them to this topic.","email_placeholder":"name@example.com","success_email":"We mailed out an invitation to \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. We'll notify you when the invitation is redeemed. Check the invitations tab on your user page to keep track of your invites.","success_username":"We've invited that user to participate in this topic.","error":"Sorry, we couldn't invite that person. Perhaps they have already been invited? (Invites are rate limited)"},"login_reply":"Përgjigju tek Diskutimi","filters":{"n_posts":{"one":"1 postim","other":"{{count}} postime"},"cancel":"Hiq filtërin"},"split_topic":{"title":"Move to New Topic","action":"move to new topic","topic_name":"New Topic Name","error":"There was an error moving posts to the new topic.","instructions":{"one":"You are about to create a new topic and populate it with the post you've selected.","other":"You are about to create a new topic and populate it with the \u003cb\u003e{{count}}\u003c/b\u003e posts you've selected."}},"merge_topic":{"title":"Move to Existing Topic","action":"move to existing topic","error":"There was an error moving posts into that topic.","instructions":{"one":"Please choose the topic you'd like to move that post to.","other":"Please choose the topic you'd like to move those \u003cb\u003e{{count}}\u003c/b\u003e posts to."}},"change_owner":{"title":"Change Owner of Posts","action":"ndrysho zotëruesin","error":"There was an error changing the ownership of the posts.","label":"New Owner of Posts","placeholder":"username of new owner","instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Please choose the new owner of the {{count}} posts by \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Note that any notifications about this post will not be transferred to the new user retroactively.\u003cbr\u003eWarning: Currently, no post-dependent data is transferred over to the new user. Use with caution."},"multi_select":{"select":"zgjidh","selected":"selected ({{count}})","select_replies":"select +replies","delete":"fshij të zgjedhurin","cancel":"anulo përzgjedhjen","select_all":"zgjidh të gjitha","deselect_all":"deselect all","description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post.","other":"You have selected \u003cb\u003e{{count}}\u003c/b\u003e posts."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"cito përgjigjen","edit":"Editing {{link}} {{replyAvatar}} {{username}}","edit_reason":"Arsyeja:","post_number":"postimi {{number}}","last_edited_on":"redaktimi fundit u krye me","reply_as_new_topic":"Përgjigju si Temë e ndërlidhur","continue_discussion":"Continuing the discussion from {{postLink}}:","follow_quote":"go to the quoted post","show_full":"Shfaq Postimin e Plotë","show_hidden":"Shfaq materialin e fshehur.","deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)","other":"(post withdrawn by author, will be automatically deleted in %{count} hours unless flagged)"},"expand_collapse":"expand/collapse","gap":{"one":"view 1 hidden reply","other":"view {{count}} hidden replies"},"more_links":"{{count}} më shumë...","unread":"Postimi është i palexuar","has_replies":{"one":"{{count}} Përgjigje","other":"{{count}} Përgjigje"},"has_likes":{"one":"{{count}} Pëlqim","other":"{{count}} Pëlqime"},"has_likes_title":{"one":"1 person liked this post","other":"{{count}} people liked this post"},"errors":{"create":"Na vjen keq, por ndodhi një gabim gjatë hapjes së temës. Provojeni përsëri.","edit":"Na vjen keq, ndodhi një gabim gjatë redaktimit të temës. Provojeni përsëri.","upload":"Sorry, there was an error uploading that file. Please try again.","attachment_too_large":"Upps, skedari qe po ngarkoni është shume i madh (maksimumi vlerave {{max_size_kb}}kb).","file_too_large":"Upps, skedari qe po ngarkoni është shume i madh (vlera maksimale {{max_size_kb}}kb)","too_many_uploads":"Na vjen keq, por ju mund te ngarkoni vetëm një skedar.","too_many_dragged_and_dropped_files":"Sorry, you can only drag \u0026 drop up to 10 files at a time.","upload_not_authorized":"Sorry, the file you are trying to upload is not authorized (authorized extension: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Sorry, new users can not upload images.","attachment_upload_not_allowed_for_new_user":"Sorry, new users can not upload attachments.","attachment_download_requires_login":"Sorry, you need to be logged in to download attachments."},"abandon":{"confirm":"Are you sure you want to abandon your post?","no_value":"Jo, mbaji","yes_value":"Po, braktise"},"via_email":"this post arrived via email","wiki":{"about":"this post is a wiki; basic users can edit it"},"archetypes":{"save":"Ruaj Opsionet"},"controls":{"reply":"shkruaj një përgjigje tek ky diskutim","like":"pëlqejë postimin","has_liked":"Ju pëlqeni këtë diskutim","undo_like":"anulo pëlqimin","edit":"redakto këtë postim","edit_anonymous":"Sorry, but you need to be logged in to edit this post.","flag":"privately flag this post for attention or send a private notification about it","delete":"fshij këtë postim","undelete":"rikthe fshirjen e postimit","share":"shpërnda një link tek ky postim","more":"Më shumë","delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?","other":"Do you also want to delete the {{count}} direct replies to this post?"},"yes_value":"Yes, delete the replies too","no_value":"Jo, vetëm këtë postim"},"admin":"post admin actions","wiki":"Bëje Wiki","unwiki":"Hiqe Wiki","convert_to_moderator":"Add Staff Color","revert_to_regular":"Remove Staff Color","rebake":"Rebuild HTML","unhide":"Unhide"},"actions":{"flag":"Shëno","defer_flags":{"one":"Defer flag","other":"Defer flags"},"it_too":{"off_topic":"Flag it too","spam":"Flag it too","inappropriate":"Flag it too","custom_flag":"Flag it too","bookmark":"Bookmark it too","like":"E pëlqejnë","vote":"Vote for it too"},"undo":{"off_topic":"Undo flag","spam":"Undo flag","inappropriate":"Undo flag","bookmark":"Undo bookmark","like":"Anulo pëlqimin","vote":"Rikthe votën"},"people":{"off_topic":"{{icons}} flagged this as off-topic","spam":"{{icons}} flagged this as spam","spam_with_url":"{{icons}} flagged \u003ca href='{{postUrl}}'\u003ethis as spam\u003c/a\u003e","inappropriate":"{{icons}} flagged this as inappropriate","notify_moderators":"{{icons}} notified moderators","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003enotified moderators\u003c/a\u003e","notify_user":"{{icons}} sent a message","notify_user_with_url":"{{icons}} sent a \u003ca href='{{postUrl}}'\u003emessage\u003c/a\u003e","bookmark":"{{icons}} bookmarked this","like":"{{icons}} liked this","vote":"{{icons}} voted for this"},"by_you":{"off_topic":"You flagged this as off-topic","spam":"You flagged this as spam","inappropriate":"You flagged this as inappropriate","notify_moderators":"You flagged this for moderation","notify_user":"You sent a message to this user","bookmark":"You bookmarked this post","like":"Ju e pëlqeni këtë","vote":"You voted for this post"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic","other":"You and {{count}} other people flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam","other":"You and {{count}} other people flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate","other":"You and {{count}} other people flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation","other":"You and {{count}} other people flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user","other":"You and {{count}} other people sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post","other":"You and {{count}} other people bookmarked this post"},"like":{"one":"You and 1 other liked this","other":"You and {{count}} other people liked this"},"vote":{"one":"You and 1 other voted for this post","other":"You and {{count}} other people voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic","other":"{{count}} people flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam","other":"{{count}} people flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate","other":"{{count}} people flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation","other":"{{count}} people flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user","other":"{{count}} sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post","other":"{{count}} people bookmarked this post"},"like":{"one":"1 person liked this","other":"{{count}} people liked this"},"vote":{"one":"1 person voted for this post","other":"{{count}} people voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?","other":"Are you sure you want to delete all those posts?"}},"revisions":{"controls":{"first":"First revision","previous":"Previous revision","next":"Next revision","last":"Last revision","hide":"Hide revision","show":"Show revision","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Show the rendered output with additions and removals inline","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Show the rendered output diffs side-by-side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Show the raw source diffs side-by-side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Raw"}}}},"category":{"can":"can\u0026hellip; ","none":"(pa kategori)","all":"Gjitha kategoritë","choose":"Select a category\u0026hellip;","edit":"redakto","edit_long":"Redakto","view":"View Topics in Category","general":"I përgjithshëm","settings":"Rregullimet","topic_template":"Topic Template","delete":"Fshi Kategori","create":"Kategori e Re","save":"Ruaj Kategori","slug":"Category Slug","slug_placeholder":"(Optional) dashed-words for url","creation_error":"There has been an error during the creation of the category.","save_error":"There was an error saving the category.","name":"Emri Kategorisë","description":"Përshkrimi","topic":"category topic","logo":"Category Logo Image","background_image":"Category Background Image","badge_colors":"Badge colors","background_color":" Ngjyra e sfondit","foreground_color":"Foreground color","name_placeholder":"One or two words maximum","color_placeholder":"Çdo ngjyrë web","delete_confirm":"Are you sure you want to delete this category?","delete_error":"There was an error deleting the category.","list":"Shfaq Kategoritë","no_description":"Please add a description for this category.","change_in_category_topic":"Redakto Përshkrimin","already_used":"This color has been used by another category","security":"Siguria","images":"Imazhe","auto_close_label":"Auto-close topics after:","auto_close_units":"orë","email_in":"Custom incoming email address:","email_in_allow_strangers":"Accept emails from anonymous users with no accounts","email_in_disabled":"Posting new topics via email is disabled in the Site Settings. To enable posting new topics via email, ","email_in_disabled_click":"enable the \"email in\" setting.","allow_badges_label":"Allow badges to be awarded in this category","edit_permissions":"Ndrysho autorizimin","add_permission":"Shto autorizim","this_year":"këtë vit","position":"pozicion","default_position":"Default Position","position_disabled":"Categories will be displayed in order of activity. To control the order of categories in lists, ","position_disabled_click":"enable the \"fixed category positions\" setting.","parent":"Parent Category","notifications":{"watching":{"title":"Watching"},"tracking":{"title":"Tracking"},"regular":{"description":"You will be notified if someone mentions your @name or replies to you."},"muted":{"title":"Muted"}}},"flagging":{"title":"Faleminderit për ndihmën që i jepni këtij komuniteti!","private_reminder":"flags are private, \u003cb\u003eonly\u003c/b\u003e visible to staff","action":"Flag Post","take_action":"Take Action","notify_action":"Mesazh","delete_spammer":"Elimino Spammer","delete_confirm":"You are about to delete \u003cb\u003e%{posts}\u003c/b\u003e posts and \u003cb\u003e%{topics}\u003c/b\u003e topics from this user, remove their account, block signups from their IP address \u003cb\u003e%{ip_address}\u003c/b\u003e, and add their email address \u003cb\u003e%{email}\u003c/b\u003e to a permanent block list. Are you sure this user is really a spammer?","yes_delete_spammer":"Po, Elimino Spammer","ip_address_missing":"(N/A)","hidden_email_address":"(fshehur)","submit_tooltip":"Submit the private flag","take_action_tooltip":"Reach the flag threshold immediately, rather than waiting for more community flags","cant":"Sorry, you can't flag this post at this time.","formatted_name":{"off_topic":"Është Jashtë teme","inappropriate":"Është e papërshtatshme","spam":"Është Spam"},"custom_placeholder_notify_user":"Të jeni specifik, konstruktiv dhe gjithmonë të sjellshëm.","custom_placeholder_notify_moderators":"Let us know specifically what you are concerned about, and provide relevant links and examples where possible.","custom_message":{"at_least":"shkruaj të pakën {{n}} karaktere ","more":"{{n}} shko tek...","left":"{{n}} remaining"}},"flagging_topic":{"title":"Faleminderit për ndihmën që i jepni këtij komuniteti!","action":"Raporto Temën","notify_action":"Message"},"topic_map":{"title":"Përmbledhja e Temës","participants_title":"Frequent Posters","links_title":"Popular Links","links_shown":"show all {{totalLinks}} links...","clicks":{"one":"1 klik","other":"%{count} klikime"}},"topic_statuses":{"warning":{"help":"Ky është një paralajmërim zyrtar."},"bookmarked":{"help":"You bookmarked this topic"},"locked":{"help":"This topic is closed; it no longer accepts new replies"},"archived":{"help":"This topic is archived; it is frozen and cannot be changed"},"unpinned":{"title":"Unpinned","help":"This topic is unpinned for you; it will display in regular order"},"pinned_globally":{"title":"Pinned Globally"},"pinned":{"title":"Pinned","help":"This topic is pinned for you; it will display at the top of its category"},"invisible":{"help":"This topic is unlisted; it will not be displayed in topic lists, and can only be accessed via a direct link"}},"posts":"Postime","posts_lowercase":"postime","posts_long":"there are {{number}} posts in this topic","original_post":"Postimi Origjinal","views":"Shikimet","views_lowercase":{"one":"view","other":"views"},"replies":"Përgjigjet","views_long":"this topic has been viewed {{number}} times","activity":"Aktiviteti","likes":"Pëlqimet","likes_lowercase":{"one":"like","other":"pëlqime"},"likes_long":"there are {{number}} likes in this topic","users":"Anëtarët","users_lowercase":{"one":"anëtar","other":"anëtarët"},"category_title":"Kategori","history":"Historia","changed_by":"nga {{author}}","raw_email":{"title":"Raw Email","not_available":"Not available!"},"categories_list":"Lista Kategorive","filters":{"with_topics":"%{filter} topics","with_category":"%{filter} %{category} topics","latest":{"help":"temat me postime të fundit"},"hot":{"title":"Kryesoret","help":"a selection of the hottest topics"},"read":{"title":"Lexo","help":"topics you've read, in the order that you last read them"},"search":{"title":"Kërko","help":"search all topics"},"categories":{"title":"Kategoritë","title_in":"Category - {{categoryName}}","help":"all topics grouped by category"},"unread":{"help":"topics you are currently watching or tracking with unread posts"},"new":{"lower_title":"e re","help":"topics created in the last few days"},"posted":{"title":"Postimet e Mia","help":"topics you have posted in"},"bookmarks":{"title":"Bookmarks","help":"topics you have bookmarked"},"category":{"help":"latest topics in the {{categoryName}} category"},"top":{"title":"Kryesoret","help":"the most active topics in the last year, month, week or day","all":{"title":"Gjithë Kohës"},"yearly":{"title":"Vjetore"},"quarterly":{"title":"Quarterly"},"monthly":{"title":"Mujore"},"weekly":{"title":"Javore"},"daily":{"title":"Ditore"},"all_time":"Gjithë Kohës","this_year":"Vit","this_quarter":"Quarter","this_month":"Month","this_week":"javë","today":"Sot","other_periods":"see top"}},"browser_update":"Unfortunately, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eyour browser is too old to work on this site\u003c/a\u003e. Please \u003ca href=\"http://browsehappy.com\"\u003eupgrade your browser\u003c/a\u003e.","permission_types":{"full":"Krijo / Përgjigju / Shiko","create_post":"Përgjigju / Shiko","readonly":"Shiko"},"poll":{"voters":{"one":"votues","other":"votuesit"},"total_votes":{"one":"total vote","other":"total votes"},"average_rating":"Vlerësimi mesatar: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"between_min_and_max_options":"You may choose between \u003cstrong\u003e%{min}\u003c/strong\u003e and \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"cast-votes":{"title":"Cast your votes","label":"Voto Tani"},"show-results":{"title":"Display the poll results","label":"Shfaq rezultatet"},"hide-results":{"title":"Back to your votes","label":"Hide results"},"open":{"title":"Fillo një Sondazh","label":"Fillo","confirm":"Are you sure you want to open this poll?"},"close":{"title":"Mbyll sondazhin","label":"Mbyll","confirm":"Are you sure you want to close this poll?"},"error_while_toggling_status":"There was an error while toggling the status of this poll.","error_while_casting_votes":"There was an error while casting your votes."},"type_to_filter":"shkruaj për kërkim","admin":{"title":"Administrator","moderator":"Moderator","dashboard":{"title":"Paneli Kontrollit","last_updated":"Dashboard last updated:","version":"Versioni","up_to_date":"Jeni të azhurnuar!","critical_available":"Përditësim i rëndësishëm.","updates_available":"Ka përditësime.","please_upgrade":"Ju lutem, azhornoje!","no_check_performed":"A check for updates has not been performed. Ensure sidekiq is running.","stale_data":"A check for updates has not been performed lately. Ensure sidekiq is running.","version_check_pending":"Looks like you upgraded recently. Fantastic!","installed_version":"Instaluar","latest_version":"Të fundit","problems_found":"Some problems have been found with your installation of Discourse:","last_checked":"Last checked","refresh_problems":"Rifresko","no_problems":"Nuk u gjet asnjë gabim.","moderators":"Moderatorët:","admins":"Administratorët:","blocked":"Bllokuar:","suspended":"Përjashtuar:","private_messages_short":"Msgs","private_messages_title":"Mesazhet","mobile_title":"Mobile","space_free":"{{size}} lirë","uploads":"uploads","backups":"backups","traffic_short":"Trafik","traffic":"Application web requests","page_views":"API Requests","page_views_short":"API Requests","show_traffic_report":"Show Detailed Traffic Report","reports":{"today":"Sot","yesterday":"Dje","last_7_days":"7 Ditët e Fundit","last_30_days":"30 Ditët e Fundit","all_time":"Gjithë Kohës","7_days_ago":"7 Ditë më parë","30_days_ago":"30 Ditë më parë","all":"Të Gjithë","view_table":"tabelë","view_chart":"bar chart","refresh_report":"Refresh Report","start_date":"Start Date","end_date":"End Date"}},"commits":{"latest_changes":"Latest changes: please update often!","by":"nga"},"flags":{"title":"Flags","old":"Të Vjetër","active":"Aktive","agree":"Pranoj","agree_title":"Confirm this flag as valid and correct","agree_flag_modal_title":"Prano dhe...","agree_flag_hide_post":"Agree (hide post + send PM)","agree_flag_hide_post_title":"Hide this post and automatically send the user a message urging them to edit it","agree_flag_restore_post":"Agree (restore post)","agree_flag_restore_post_title":"Rikthe këtë postim","agree_flag":"Agree with flag","agree_flag_title":"Agree with flag and keep the post unchanged","defer_flag":"Defer","defer_flag_title":"Remove this flag; it requires no action at this time.","delete":"Fshij","delete_title":"Delete the post this flag refers to.","delete_post_defer_flag":"Delete post and Defer flag","delete_post_defer_flag_title":"Delete post; if the first post, delete the topic","delete_post_agree_flag":"Delete post and Agree with flag","delete_post_agree_flag_title":"Delete post; if the first post, delete the topic","delete_flag_modal_title":"Delete and...","delete_spammer":"Elimino Spammer","delete_spammer_title":"Remove the user and all posts and topics by this user.","disagree_flag_unhide_post":"Disagree (unhide post)","disagree_flag_unhide_post_title":"Remove any flags from this post and make the post visible again","disagree_flag":"Disagree","disagree_flag_title":"Deny this flag as invalid or incorrect","clear_topic_flags":"U krye","clear_topic_flags_title":"The topic has been investigated and issues have been resolved. Click Done to remove the flags.","more":"(më shumë përgjigje...)","dispositions":{"agreed":"dakort","disagreed":"disagreed","deferred":"deferred"},"flagged_by":"Flagged by","resolved_by":"Zgjidhur nga","took_action":"Took action","system":"Sistemi","error":"Something went wrong","reply_message":"Përgjigju","no_results":"Nuk ka sinjalizime.","topic_flagged":"This \u003cstrong\u003etopic\u003c/strong\u003e has been flagged.","visit_topic":"Visit the topic to take action","was_edited":"Post was edited after the first flag","previous_flags_count":"This post has already been flagged {{count}} times.","summary":{"action_type_3":{"one":"off-topic","other":"off-topic x{{count}}"},"action_type_4":{"one":"inappropriate","other":"inappropriate x{{count}}"},"action_type_6":{"one":"custom","other":"custom x{{count}}"},"action_type_7":{"one":"custom","other":"custom x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Grupi Parësor","no_primary":"(no primary group)","title":"Grupet","edit":"Redakto Grup","refresh":"Rifresko","new":"I Ri","selector_placeholder":"enter username","name_placeholder":"Group name, no spaces, same as username rule","about":"Edit your group membership and names here","group_members":"Anëtarët e grupit","delete":"Fshij","delete_confirm":"Delete this group?","delete_failed":"Unable to delete group. If this is an automatic group, it cannot be destroyed.","delete_member_confirm":"Remove '%{username}' from the '%{group}' group?","name":"Emri","add":"Shto","add_members":"Shto Anëtar","custom":"Custom","automatic":"Automatik","automatic_membership_email_domains":"Users who register with an email domain that exactly matches one in this list will be automatically added to this group:","automatic_membership_retroactive":"Apply the same email domain rule to add existing registered users","default_title":"Default title for all users in this group","primary_group":"Automatically set as primary group"},"api":{"generate_master":"Gjenero Master API Key","none":"There are no active API keys right now.","user":"Anëtarë","title":"API","key":"API Key","generate":"Gjenero","regenerate":"Rigjenero","revoke":"Revoko","confirm_regen":"Are you sure you want to replace that API Key with a new one?","confirm_revoke":"Are you sure you want to revoke that key?","info_html":"Your API key will allow you to create and update topics using JSON calls.","all_users":"Gjithë Anëtarët","note_html":"Keep this key \u003cstrong\u003esecret\u003c/strong\u003e, all users that have it may create arbitrary posts as any user."},"plugins":{"title":"Shtojca","installed":"Shtojcat e Instaluara","name":"Emri","none_installed":"You don't have any plugins installed.","version":"Versioni","enabled":"Aktivizuar?","is_enabled":"Y","not_enabled":"N","change_settings":"Ndrysho Rregullimet","change_settings_short":"Rregullimet","howto":"How do I install plugins?"},"backups":{"title":"Backups","menu":{"backups":"Backups","logs":"Logs"},"none":"No backup available.","read_only":{"enable":{"title":"Enable the read-only mode","label":"Enable read-only mode","confirm":"Are you sure you want to enable the read-only mode?"},"disable":{"title":"Disable the read-only mode","label":"Disable read-only mode"}},"logs":{"none":"No logs yet..."},"columns":{"filename":"Filename","size":"Size"},"upload":{"label":"Upload","title":"Upload a backup to this instance","uploading":"Duke ngarkuar...","success":"'{{filename}}' has successfully been uploaded.","error":"There has been an error while uploading '{{filename}}': {{message}}"},"operations":{"is_running":"An operation is currently running...","failed":"The {{operation}} failed. Please check the logs.","cancel":{"label":"Anulo","title":"Cancel the current operation","confirm":"Are you sure you want to cancel the current operation?"},"backup":{"label":"Backup","title":"Create a backup","confirm":"Do you want to start a new backup?","without_uploads":"Yes (do not include files)"},"download":{"label":"Shkarko","title":"Download the backup"},"destroy":{"title":"Remove the backup","confirm":"Are you sure you want to destroy this backup?"},"restore":{"is_disabled":"Restore is disabled in the site settings.","label":"Rikthe","title":"Restore the backup","confirm":"Are your sure you want to restore this backup?"},"rollback":{"label":"Rollback","title":"Rollback the database to previous working state","confirm":"Are your sure you want to rollback the database to the previous working state?"}}},"export_csv":{"user_archive_confirm":"Are you sure you want to download your posts?","success":"Export initiated, you will be notified via message when the process is complete.","failed":"Export failed. Please check the logs.","rate_limit_error":"Posts can be downloaded once per day, please try again tomorrow.","button_text":"Eksport","button_title":{"user":"Export full user list in CSV format.","staff_action":"Export full staff action log in CSV format.","screened_email":"Export full screened email list in CSV format.","screened_ip":"Export full screened IP list in CSV format.","screened_url":"Export full screened URL list in CSV format."}},"export_json":{"button_text":"Eksport"},"invite":{"button_text":"Dërgo ftesa","button_title":"Dërgo ftesa"},"customize":{"title":"Personalizo","long_title":"Site Customizations","css":"CSS","header":"Header","top":"Top","footer":"Footer","head_tag":{"text":"\u003c/head\u003e","title":"HTML that will be inserted before the \u003c/head\u003e tag"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML that will be inserted before the \u003c/body\u003e tag"},"override_default":"Do not include standard style sheet","enabled":"Aktivizuar?","preview":"shqyrto","undo_preview":"remove preview","rescue_preview":"default style","explain_preview":"See the site with this custom stylesheet","explain_undo_preview":"Go back to the currently enabled custom stylesheet","explain_rescue_preview":"See the site with the default stylesheet","save":"Ruaj","new":"E Re","new_style":"Veshje e Re","import":"Import","import_title":"Select a file or paste text","delete":"Fshij","delete_confirm":"Delete this customization?","about":"Modify CSS stylesheets and HTML headers on the site. Add a customization to start.","color":"Ngjyra","opacity":"Opaciteti","copy":"Kopjo","css_html":{"title":"CSS/HTML","long_title":"CSS and HTML Customizations"},"colors":{"title":"Ngjyrat","long_title":"Color Schemes","about":"Modify the colors used on the site without writing CSS. Add a scheme to start.","new_name":"New Color Scheme","copy_name_prefix":"Kopje e","delete_confirm":"Delete this color scheme?","undo":"rikthe","undo_title":"Undo your changes to this color since the last time it was saved.","revert":"rikthe","revert_title":"Reset this color to Discourse's default color scheme.","primary":{"name":"parësor","description":"Most text, icons, and borders."},"secondary":{"name":"dytësor","description":"The main background color, and text color of some buttons."},"tertiary":{"name":"tertiary","description":"Links, some buttons, notifications, and accent color."},"quaternary":{"name":"quaternary","description":"Navigation links."},"header_background":{"name":"header background","description":"Background color of the site's header."},"header_primary":{"name":"header primary","description":"Text and icons in the site's header."},"highlight":{"name":"highlight","description":"The background color of highlighted elements on the page, such as posts and topics."},"danger":{"name":"rrezik","description":"Highlight color for actions like deleting posts and topics."},"success":{"name":"sukses","description":"Used to indicate an action was successful."},"love":{"name":"love","description":"The like button's color."},"wiki":{"name":"wiki","description":"Base color used for the background of wiki posts."}}},"email":{"title":"Email","settings":"Rregullimet","all":"Të gjithë","sending_test":"Sending test Email...","error":"\u003cb\u003eERROR\u003c/b\u003e - %{server_error}","test_error":"There was a problem sending the test email. Please double-check your mail settings, verify that your host is not blocking mail connections, and try again.","sent":"Dërguar","skipped":"Skipped","sent_at":"Sent At","time":"Koha","user":"User","email_type":"Email Type","to_address":"To Address","test_email_address":"email address to test","send_test":"Send Test Email","sent_test":"u dërgua!","delivery_method":"Delivery Method","preview_digest":"Preview Digest","refresh":"Rifresko","format":"Formati","html":"html","text":"tekst","last_seen_user":"Last Seen User:","reply_key":"Reply Key","skipped_reason":"Skip Reason","logs":{"none":"No logs found.","filters":{"title":"Filter","user_placeholder":"username","address_placeholder":"emri@shembull.com","type_placeholder":"digest, signup...","reply_key_placeholder":"reply key","skipped_reason_placeholder":"arsye"}}},"logs":{"title":"Logs","action":"Action","created_at":"Krijuar","last_match_at":"Last Matched","match_count":"Matches","ip_address":"IP","topic_id":"Topic ID","post_id":"Post ID","delete":"Fshij","edit":"Redakto","save":"Ruaj","screened_actions":{"block":"blloko","do_nothing":"do nothing"},"staff_actions":{"title":"Staff Actions","instructions":"Click usernames and actions to filter the list. Click profile pictures to go to user pages.","clear_filters":"Show Everything","staff_user":"Staff User","target_user":"Target User","subject":"Subject","when":"Kur","context":"Context","details":"Detaje","previous_value":"Previous","new_value":"I Ri","diff":"Diff","show":"Show","modal_title":"Detaje","no_previous":"There is no previous value.","deleted":"No new value. The record was deleted.","actions":{"delete_user":"delete user","change_trust_level":"change trust level","change_username":"change username","change_site_setting":"change site setting","change_site_customization":"change site customization","delete_site_customization":"delete site customization","suspend_user":"suspend user","unsuspend_user":"unsuspend user","grant_badge":"grant badge","revoke_badge":"revoke badge","check_email":"check email","delete_topic":"delete topic","delete_post":"delete post","impersonate":"impersonate","anonymize_user":"anonymize user","roll_up":"roll up IP blocks"}},"screened_emails":{"title":"Screened Emails","description":"When someone tries to create a new account, the following email addresses will be checked and the registration will be blocked, or some other action performed.","email":"Email Address","actions":{"allow":"Lejo"}},"screened_urls":{"title":"Screened URLs","description":"The URLs listed here were used in posts by users who have been identified as spammers.","url":"URL","domain":"Domain"},"screened_ips":{"title":"Screened IPs","description":"IP addresses that are being watched. Use \"Allow\" to whitelist IP addresses.","delete_confirm":"Are you sure you want to remove the rule for %{ip_address}?","roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?","rolled_up_some_subnets":"Successfully rolled up IP ban entries to these subnets: %{subnets}.","rolled_up_no_subnet":"There was nothing to roll up.","actions":{"block":"Blloko","do_nothing":"Lejo","allow_admin":"Allow Admin"},"form":{"label":"E Re:","ip_address":"Adresa IP","add":"Shto","filter":"Kërko"},"roll_up":{"text":"Roll up","title":"Creates new subnet ban entries if there are at least 'min_ban_entries_for_roll_up' entries."}},"logster":{"title":"Error Logs"}},"impersonate":{"title":"Impersonate","help":"Use this tool to impersonate a user account for debugging purposes. You will have to log out once finished.","not_found":"That user can't be found.","invalid":"Sorry, you may not impersonate that user."},"users":{"title":"Users","create":"Add Admin User","last_emailed":"Last Emailed","not_found":"Sorry, that username doesn't exist in our system.","id_not_found":"Sorry, that user id doesn't exist in our system.","active":"Aktivë","show_emails":"Show Emails","nav":{"new":"New","active":"Aktiv","pending":"Pezulluar","staff":"Stafi","suspended":"Suspended","blocked":"Blocked","suspect":"Suspect"},"approved":"Aprovuar?","approved_selected":{"one":"approve user","other":"approve users ({{count}})"},"reject_selected":{"one":"reject user","other":"reject users ({{count}})"},"titles":{"active":"Active Users","new":"New Users","pending":"Users Pending Review","newuser":"Users at Trust Level 0 (New User)","basic":"Users at Trust Level 1 (Basic User)","staff":"Stafi","admins":"Admin Users","moderators":"Moderators","blocked":"Blocked Users","suspended":"Suspended Users","suspect":"Suspect Users"},"reject_successful":{"one":"Successfully rejected 1 user.","other":"Successfully rejected %{count} users."},"reject_failures":{"one":"Failed to reject 1 user.","other":"Failed to reject %{count} users."},"not_verified":"I pa verifikuar","check_email":{"title":"Reveal this user's email address","text":"Shfaq"}},"user":{"suspend_failed":"Something went wrong suspending this user {{error}}","unsuspend_failed":"Something went wrong unsuspending this user {{error}}","suspend_duration":"How long will the user be suspended for?","suspend_duration_units":"(ditë)","suspend_reason_label":"Why are you suspending? This text \u003cb\u003ewill be visible to everyone\u003c/b\u003e on this user's profile page, and will be shown to the user when they try to log in. Keep it short.","suspend_reason":"Arsye","suspended_by":"Përjashtuar nga:","delete_all_posts":"Fshi gjithë postimet","delete_all_posts_confirm":"You are about to delete %{posts} posts and %{topics} topics. Are you sure?","suspend":"Suspend","unsuspend":"Unsuspend","suspended":"Suspended?","moderator":"Moderator?","admin":"Admin?","blocked":"Bllokuar?","show_admin_profile":"Admin","edit_title":"Redakto Titullin","save_title":"Ruaj Titullin","refresh_browsers":"Forco rifreskimin e shfletuesit","refresh_browsers_message":"Mesazhi u dërgua tek të gjithë klientët!","show_public_profile":"Shfaq Profilin Publik","impersonate":"Impersonate","ip_lookup":"Shiko IP","log_out":"Dilni","logged_out":"User was logged out on all devices","revoke_admin":"Revoko Admin","grant_admin":"Grant Admin","revoke_moderation":"Revoke Moderation","grant_moderation":"Grant Moderation","unblock":"Unblock","block":"Blloko","reputation":"Reputation","permissions":"Permissions","activity":"Aktiviteti","like_count":"Likes Given / Received","last_100_days":"në 100 ditët e fundit","private_topics_count":"Diskutime Private","posts_read_count":"Posts Read","post_count":"Posts Created","topics_entered":"Topics Viewed","flags_given_count":"Flags Given","flags_received_count":"Flags Received","warnings_received_count":"Warnings Received","flags_given_received_count":"Flags Given / Received","approve":"Aprovo","approved_by":"aprovuar nga","approve_success":"User approved and email sent with activation instructions.","approve_bulk_success":"Success! All selected users have been approved and notified.","time_read":"Koha e Leximit","anonymize":"Anonymize User","anonymize_confirm":"Are you SURE you want to anonymize this account? This will change the username and email, and reset all profile information.","anonymize_yes":"Yes, anonymize this account","anonymize_failed":"There was a problem anonymizing the account.","delete":"Fshij Anëtarë","delete_forbidden_because_staff":"Admins and moderators can't be deleted.","delete_posts_forbidden_because_staff":"Can't delete all posts of admins and moderators.","delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)","other":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} days old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)","other":"Can't delete all posts. Some posts are older than %{count} days old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)","other":"Can't delete all posts because the user has more than %{count} posts.  (delete_all_posts_max)"},"delete_confirm":"Are you SURE you want to delete this user? This is permanent!","delete_and_block":"Delete and \u003cb\u003eblock\u003c/b\u003e this email and IP address","delete_dont_block":"Fshij vetëm","deleted":"Anëtari u fshi.","delete_failed":"There was an error deleting that user. Make sure all posts are deleted before trying to delete the user.","send_activation_email":"Dërgo Emailin e Aktivizimit","activation_email_sent":"An activation email has been sent.","send_activation_email_failed":"There was a problem sending another activation email. %{error}","activate":"Aktivizo Llogarinë","activate_failed":"There was a problem activating the user.","deactivate_account":"Deactivate Account","deactivate_failed":"There was a problem deactivating the user.","unblock_failed":"There was a problem unblocking the user.","block_failed":"There was a problem blocking the user.","deactivate_explanation":"A deactivated user must re-validate their email.","suspended_explanation":"A suspended user can't log in.","block_explanation":"A blocked user can't post or start topics.","trust_level_change_failed":"There was a problem changing the user's trust level.","suspend_modal_title":"Suspend User","trust_level_2_users":"Trust Level 2 Users","trust_level_3_requirements":"Trust Level 3 Requirements","trust_level_locked_tip":"trust level is locked, system will not promote or demote user","trust_level_unlocked_tip":"trust level is unlocked, system will may promote or demote user","lock_trust_level":"Lock Trust Level","unlock_trust_level":"Unlock Trust Level","tl3_requirements":{"title":"Requirements for Trust Level 3","table_title":"Në 100 ditët e fundit:","value_heading":"Vlera","requirement_heading":"Requirement","visits":"Vizita","days":"ditë","topics_replied_to":"Topics Replied To","topics_viewed":"Topics Viewed","topics_viewed_all_time":"Topics Viewed (all time)","posts_read":"Posts Read","posts_read_all_time":"Posts Read (all time)","flagged_posts":"Flagged Posts","flagged_by_users":"Users Who Flagged","likes_given":"Likes Given","likes_received":"Likes Received","likes_received_days":"Likes Received: unique days","likes_received_users":"Likes Received: unique users","qualifies":"Qualifies for trust level 3.","does_not_qualify":"Doesn't qualify for trust level 3.","will_be_promoted":"Will be promoted soon.","will_be_demoted":"Will be demoted soon.","on_grace_period":"Currently in promotion grace period, will not be demoted.","locked_will_not_be_promoted":"Trust level locked. Will never be promoted.","locked_will_not_be_demoted":"Trust level locked. Will never be demoted."},"sso":{"title":"Single Sign On","external_id":"External ID","external_username":"Pseudonimi","external_name":"Emri","external_email":"Email","external_avatar_url":"Profile Picture URL"}},"user_fields":{"title":"User Fields","help":"Add fields that your users can fill out.","create":"Create User Field","untitled":"Pa Titull","name":"Field Name","type":"Field Type","description":"Field Description","save":"Ruaj","edit":"Redakto","delete":"Fshij","cancel":"Anulo","delete_confirm":"Are you sure you want to delete that user field?","options":"Opsione","required":{"title":"Required at signup?","enabled":"i nevojshëm","disabled":"fakultativ"},"editable":{"title":"Editable after signup?","enabled":"editable","disabled":"not editable"},"show_on_profile":{"title":"Show on public profile?","enabled":"shown on profile","disabled":"not shown on profile"},"field_types":{"text":"Text Field","confirm":"Confirmation","dropdown":"Dropdown"}},"site_text":{"none":"Choose a type of content to begin editing.","title":"Text Content"},"site_settings":{"show_overriden":"Only show overridden","title":"Rregullimet","reset":"reseto","none":"asnjë","no_results":"Nuk u gjet asnjë rezultat.","clear_filter":"Pastro","add_url":"add URL","add_host":"add host","categories":{"all_results":"All","required":"Required","basic":"Basic Setup","users":"Users","posting":"Posting","email":"Email","files":"Skedarë","trust":"Niveli Besimit","security":"Siguria","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Rate Limits","developer":"Developer","embedding":"Embedding","legal":"Legale","uncategorized":"Të tjerë","backups":"Backups","login":"Idetifikohu","plugins":"Plugins"}},"badges":{"title":"Badges","new_badge":"New Badge","new":"I Ri","name":"Emri","badge":"Badge","display_name":"Emri Shfaqur","description":"Description","badge_type":"Badge Type","badge_grouping":"Grupi","badge_groupings":{"modal_title":"Badge Groupings"},"granted_by":"Granted By","granted_at":"Granted At","reason_help":"(A link to a post or topic)","save":"Ruaj","delete":"Fshij","delete_confirm":"Are you sure you want to delete this badge?","revoke":"Revoke","reason":"Arsye","expand":"Expand \u0026hellip;","revoke_confirm":"Are you sure you want to revoke this badge?","edit_badges":"Edit Badges","grant_badge":"Grant Badge","granted_badges":"Granted Badges","grant":"Grant","no_user_badges":"%{name} has not been granted any badges.","no_badges":"There are no badges that can be granted.","none_selected":"Select a badge to get started","allow_title":"Allow badge to be used as a title","multiple_grant":"Can be granted multiple times","listable":"Show badge on the public badges page","enabled":"Enable badge","icon":"Icon","image":"Imazh","icon_help":"Use either a Font Awesome class or URL to an image","query":"Badge Query (SQL)","target_posts":"Query targets posts","auto_revoke":"Run revocation query daily","show_posts":"Show post granting badge on badge page","trigger":"Trigger","trigger_type":{"none":"Update daily","post_action":"When a user acts on post","post_revision":"When a user edits or creates a post","trust_level_change":"When a user changes trust level","user_change":"When a user is edited or created"},"preview":{"link_text":"Preview granted badges","plan_text":"Preview with query plan","modal_title":"Badge Query Preview","sql_error_header":"There was an error with the query.","error_help":"See the following links for help with badge queries.","bad_count_warning":{"header":"KUJDES!","text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"sample":"Shëmbull:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link} at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Add new emoji that will be available to everyone. (PROTIP: drag \u0026 drop multiple files at once)","add":"Add New Emoji","name":"Name","image":"Imazh","delete_confirm":"Are you sure you want to delete the :%{name}: emoji?"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","add":"Add","filter":"Search (URL or External URL)"}}},"lightbox":{"download":"shkarko"},"search_help":{"title":"Ndihma"},"keyboard_shortcuts_help":{"title":"Shkurtimet e Tastierës ","jump_to":{"title":"Kalo tek","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Home","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Latest","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e New","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Unread","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategoritë","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Top","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Bookmarks"},"navigation":{"title":"Shfletimi","jump":"\u003cb\u003e#\u003c/b\u003e Shko tek postimi #","back":"\u003cb\u003eu\u003c/b\u003e Mbrapa","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Move selection \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e Open selected topic","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Next/previous section"},"application":{"title":"Aplikacion","create":"\u003cb\u003ec\u003c/b\u003e Filloni një diskutim të ri","notifications":"\u003cb\u003en\u003c/b\u003e Open notifications","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Open user menu","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Show updated topics","search":"\u003cb\u003e/\u003c/b\u003e Kërko","help":"\u003cb\u003e?\u003c/b\u003e Open keyboard help","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Dismiss New/Posts","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Dismiss Topics"},"actions":{"title":"Actions","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Toggle bookmark topic","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Pin/Unpin topic","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Share topic","share_post":"\u003cb\u003es\u003c/b\u003e Share post","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Përgjigju si Temë e ndërlidhur","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Reply to topic","reply_post":"\u003cb\u003er\u003c/b\u003e Reply to post","quote_post":"\u003cb\u003eq\u003c/b\u003e Quote post","like":"\u003cb\u003el\u003c/b\u003e Like post","flag":"\u003cb\u003e!\u003c/b\u003e Flag post","bookmark":"\u003cb\u003eb\u003c/b\u003e Bookmark post","edit":"\u003cb\u003ee\u003c/b\u003e Edit post","delete":"\u003cb\u003ed\u003c/b\u003e Delete post","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mute topic","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Regular (default) topic","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Track topic","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Watch topic"}},"badges":{"title":"Badges","allow_title":"can be used as a title","multiple_grant":"can be awarded multiple times","badge_count":{"one":"1 Badge","other":"%{count} Badges"},"more_badges":{"one":"+1 More","other":"+%{count} More"},"granted":{"one":"1 granted","other":"%{count} granted"},"select_badge_for_title":"Select a badge to use as your title","none":"\u003casnjë\u003e","badge_grouping":{"getting_started":{"name":"Getting Started"},"community":{"name":"Komuniteti"},"trust_level":{"name":"Trust Level"},"other":{"name":"Other"},"posting":{"name":"Posting"}},"badge":{"editor":{"name":"Editor","description":"First post edit"},"basic_user":{"name":"Basic","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eGranted\u003c/a\u003e all essential community functions"},"member":{"name":"Member","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eGranted\u003c/a\u003e invitations"},"regular":{"name":"Regular","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"leader":{"name":"Leader","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eGranted\u003c/a\u003e global edit, pin, close, archive, split and merge"},"welcome":{"name":"Welcome","description":"Received a like"},"autobiographer":{"name":"Autobiographer","description":"Filled user \u003ca href=\"/my/preferences\"\u003eprofile\u003c/a\u003e information"},"anniversary":{"name":"Përvjetori","description":"Active member for a year, posted at least once"},"nice_post":{"name":"Nice Post","description":"Received 10 likes on a post. This badge can be granted multiple times"},"good_post":{"name":"Good Post","description":"Received 25 likes on a post. This badge can be granted multiple times"},"great_post":{"name":"Great Post","description":"Received 50 likes on a post. This badge can be granted multiple times"},"nice_topic":{"name":"Nice Topic","description":"Received 10 likes on a topic. This badge can be granted multiple times"},"good_topic":{"name":"Good Topic","description":"Received 25 likes on a topic. This badge can be granted multiple times"},"great_topic":{"name":"Great Topic","description":"Received 50 likes on a topic. This badge can be granted multiple times"},"nice_share":{"name":"Nice Share","description":"Shared a post with 25 unique visitors"},"good_share":{"name":"Good Share","description":"Shared a post with 300 unique visitors"},"great_share":{"name":"Great Share","description":"Shared a post with 1000 unique visitors"},"first_like":{"name":"Pëlqimi i Parë","description":"Liked a post"},"first_flag":{"name":"First Flag","description":"Flagged a post"},"promoter":{"name":"Promoter","description":"Invited a user"},"campaigner":{"name":"Campaigner","description":"Invited 3 basic users (trust level 1)"},"champion":{"name":"Champion","description":"Invited 5 members (trust level 2)"},"first_share":{"name":"First Share","description":"Shared a post"},"first_link":{"name":"First Link","description":"Added an internal link to another topic"},"first_quote":{"name":"Citimi i Parë","description":"Quoted a user"},"read_guidelines":{"name":"Read Guidelines","description":"Read the \u003ca href=\"/guidelines\"\u003ecommunity guidelines\u003c/a\u003e"},"reader":{"name":"Lexues","description":"Read every post in a topic with more than 100 posts"}}}}},"en":{"js":{"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"}},"user":{"expand_profile":"Expand","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"login":{"to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"regular":{"title":"Normal"},"regular_pm":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."}},"post":{"has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"change_owner":"Change Ownership"}},"category":{"create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"notify_staff":"Notify Staff"},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"embedded_css":"Embedded CSS","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}}},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge":{"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'sq';
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
// locale : Albanian (sq)
// author : Flakërim Ismani : https://github.com/flakerimi
// author: Menelion Elensúle: https://github.com/Oire (tests)
// author : Oerd Cukalla : https://github.com/oerd (fixes)

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    return moment.defineLocale('sq', {
        months : "Janar_Shkurt_Mars_Prill_Maj_Qershor_Korrik_Gusht_Shtator_Tetor_Nëntor_Dhjetor".split("_"),
        monthsShort : "Jan_Shk_Mar_Pri_Maj_Qer_Kor_Gus_Sht_Tet_Nën_Dhj".split("_"),
        weekdays : "E Diel_E Hënë_E Martë_E Mërkurë_E Enjte_E Premte_E Shtunë".split("_"),
        weekdaysShort : "Die_Hën_Mar_Mër_Enj_Pre_Sht".split("_"),
        weekdaysMin : "D_H_Ma_Më_E_P_Sh".split("_"),
        meridiem : function (hours, minutes, isLower) {
            return hours < 12 ? 'PD' : 'MD';
        },
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd, D MMMM YYYY LT"
        },
        calendar : {
            sameDay : '[Sot në] LT',
            nextDay : '[Nesër në] LT',
            nextWeek : 'dddd [në] LT',
            lastDay : '[Dje në] LT',
            lastWeek : 'dddd [e kaluar në] LT',
            sameElse : 'L'
        },
        relativeTime : {
            future : "në %s",
            past : "%s më parë",
            s : "disa sekonda",
            m : "një minutë",
            mm : "%d minuta",
            h : "një orë",
            hh : "%d orë",
            d : "një ditë",
            dd : "%d ditë",
            M : "një muaj",
            MM : "%d muaj",
            y : "një vit",
            yy : "%d vite"
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
