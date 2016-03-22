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
MessageFormat.locale.ar = function(n) {
  if (n === 0) {
    return 'zero';
  }
  if (n == 1) {
    return 'one';
  }
  if (n == 2) {
    return 'two';
  }
  if ((n % 100) >= 3 && (n % 100) <= 10 && n == Math.floor(n)) {
    return 'few';
  }
  if ((n % 100) >= 11 && (n % 100) <= 99 && n == Math.floor(n)) {
    return 'many';
  }
  return 'other';
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
r += "هناك ";
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
r += (pf_0[ MessageFormat.locale["ar"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += (pf_0[ MessageFormat.locale["ar"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "هذا الموضوع له ";
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
r += (pf_0[ MessageFormat.locale["ar"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
}});I18n.translations = {"ar":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n% u","units":{"byte":{"zero":"بايت","one":"بايت","two":"بايت","few":"بايت","many":"بايت","other":"بايت"},"gb":"جيجا بايت","kb":"كيلو بايت","mb":"ميجا بايت","tb":"تيرا بايت"}}},"short":{"thousands":"{{number}} ألف","millions":"{{number}} مليون"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMM D, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"zero":"\u003e %{count}ث","one":"\u003e ثانية","two":"\u003e ثانيتان","few":"\u003e %{count}ث","many":"\u003e %{count}ث","other":"أقل من %{count} ثانية"},"x_seconds":{"zero":"%{count} ثانية","one":"%{count} ثانية","two":"%{count} ثانية","few":"%{count} ثانية","many":"%{count} ثانية","other":"%{count} ثانية"},"less_than_x_minutes":{"zero":"\u003c 0 د","one":"\u003c 1 د","two":"\u003c 2 د","few":"\u003c %{count} د","many":"\u003c %{count} د","other":"أقل من %{count} دقيقة"},"x_minutes":{"zero":"0 د","one":"1 د","two":"2 د","few":"%{count} د","many":"%{count} د","other":"%{count} دقيقة"},"about_x_hours":{"zero":"0 س","one":"1 س","two":"2 س","few":"%{count} س","many":"%{count} ساعة","other":"%{count} ساعة"},"x_days":{"zero":"0 ي","one":"1 ي","two":"2 ي","few":"%{count} ي","many":"%{count} ي","other":"%{count} يوم"},"about_x_years":{"zero":"0 ع","one":"1 ع","two":"2 ع","few":"%{count} ع","many":"%{count} ع","other":"%{count} عام"},"over_x_years":{"zero":"\u003e 0 ع","one":"\u003e 1 ع","two":"\u003e 2 ع","few":"\u003e %{count} ع","many":"\u003e %{count} ع","other":"أكثر من %{count} عام"},"almost_x_years":{"zero":"0 ع","one":"1 ع","two":"2 ع","few":"%{count} ع","many":"%{count} ع","other":"%{count} عام"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"zero":"0 دقيقة","one":"دقيقة واحدة","two":"دقيقتان","few":"%{count} دقائق","many":"%{count} دقيقة","other":"%{count} دقيقة"},"x_hours":{"zero":"0 ساعة","one":"ساعة واحدة","two":"ساعتان","few":"%{count} ساعات","many":"%{count} ساعة","other":"%{count} ساعات"},"x_days":{"zero":"0 يوم","one":"يوم واحد","two":"يومان","few":"%{count} أيام","many":"%{count} يومًا","other":"%{count} أيام"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"zero":"منذ 0 دقيقة","one":"منذ دقيقة واحدة","two":"منذ دقيقتين","few":"منذ %{count} دقائق","many":"منذ %{count} دقيقة","other":"منذ %{count} دقيقة"},"x_hours":{"zero":"منذ 0 ساعة","one":"منذ ساعة واحدة","two":"منذ ساعتين","few":"منذ %{count} ساعات","many":"منذ %{count} ساعة","other":"منذ %{count} ساعة"},"x_days":{"zero":"%{count} يوم مضى","one":"%{count} يوم مضى","two":"%{count} يوم مضى","few":"%{count} يوم مضى","many":"%{count} يوم مضى","other":"%{count} يوم مضى"}},"later":{"x_days":{"zero":"%{count} يوم مضى","one":"1 يوم مضى","two":"يومان مضى {count}%","few":"أيام مضت {count}%","many":"أيام مضت {count}%","other":"أيام مضت {count}%"},"x_months":{"zero":"بعد أقل من شهر.","one":"بعد شهر.","two":"بعد شهرين.","few":"بعد %{count} أشهر","many":"بعد %{count} شهر.","other":"بعد %{count} شهر."},"x_years":{"zero":"بعد أقل من سنة.","one":"بعد سنة واحدة.","two":"بعد سنتين.","few":"بعد %{count}  سنوات.","many":"بعد %{count}  سنوات.","other":"بعد %{count}  سنة."}}},"share":{"topic":"ضع رابطاً في هذا الموضوع.","post":"الموضوع رقم %{postNumber}","close":"اغلق","twitter":"شارك هذا الرابط عن طريق تويتر","facebook":"شارك هذا الرابط عن طريق فيس بوك","google+":"شارك هذا الرابط عن طريق جوجل+","email":"شارك هذا الرابط عن طريق البريد الالكتروني"},"action_codes":{"split_topic":"تقسيم هذا الموضوع %{when}","autoclosed":{"enabled":"أغلق %{when}","disabled":"مفتوح %{when}"},"closed":{"enabled":"مغلق %{when}","disabled":"مفتوح %{when}"},"archived":{"enabled":"مؤرشف %{when}","disabled":"غير مؤرشف %{when}"},"pinned":{"enabled":"مثبت %{when}","disabled":"غير مثبت %{when}"},"pinned_globally":{"enabled":"مثبت عالمياً %{when}","disabled":"غير مثبت %{when}"},"visible":{"enabled":"مدرج %{when}","disabled":"غير مدرج %{when}"}},"topic_admin_menu":"عمليات المدير","emails_are_disabled":"جميع الرسائل الالكترونية المرسلة تم تعطيلها من قبل المدير , لن يتم ارسال اشعار من اي نوع لبريدك الإلكتروني .","edit":"عدّل العنوان و التصنيف لهذا الموضوع","not_implemented":"لم يتم تنفيذ هذه الميزة حتى الآن، نعتذر!","no_value":"لا","yes_value":"نعم","generic_error":"نعتذر، حدث خطأ.","generic_error_with_reason":"حدث خطأ : %{error}","sign_up":"إشترك","log_in":"تسجيل الدخول ","age":"العمر","joined":"إنضم","admin_title":"المدير","flags_title":"بلاغات","show_more":"أعرض المزيد","show_help":"خيارات","links":"روابط","links_lowercase":{"zero":"رابط","one":"رابط","two":"رابط","few":"رابط","many":"روابط","other":"روابط"},"faq":"التعليمات","guidelines":"توجيهات ","privacy_policy":"سياسة الخصوصية ","privacy":"الخصوصية ","terms_of_service":"شروط الخدمة","mobile_view":"رؤية هاتفية ","desktop_view":"رؤية مكتبية ","you":"انت","or":"او","now":"الآن","read_more":"اقرأ المزيد","more":"المزيد","less":"أقل","never":"ابداً","daily":"يومي","weekly":"اسبوعي","every_two_weeks":"كل اسبوعين","every_three_days":"كل ثلاثة أيام","max_of_count":"اقصى {{count}}","alternation":"أو","character_count":{"zero":"0 حرف","one":"حرف واحد","two":"حرفان","few":"{{count}} أحرف","many":"{{count}} حرفًا","other":"{{count}} حرف"},"suggested_topics":{"title":"مواضيع مقترحة"},"about":{"simple_title":"نبذة","title":"عن %{title}","stats":"إحصائيات الموقع ","our_admins":"مدراؤنا","our_moderators":"مشرفونا","stat":{"all_time":"دائما ","last_7_days":"آخر 7 أيام ","last_30_days":"آخر 30 يوم"},"like_count":"اعجابات","topic_count":"مواضيع","post_count":"مشاركات","user_count":"مستخدمون جدد","active_user_count":"مستخدمون نشطون","contact":"اتصل بنا","contact_info":"في حالة حدوث أي مشكلة حرجة أو مسألة عاجلة تؤثر على هذا الموقع، يرجى الاتصال بنا على %{contact_info} ."},"bookmarked":{"title":"المفضلة","clear_bookmarks":"حذف المفضله","help":{"bookmark":"انقر هنا لإضافة أول رد في هذا الموضوع الى المفضلة","unbookmark":"أنقر هنا لحذف كل المفضلة في هذا الموضوع"}},"bookmarks":{"not_logged_in":"نعتذر يجب ان تكون متصلا لكي تقوم بإضافة هدا الموضوع للمفضلة","created":"لقد نجحت في إضافة الموضوع للمفضلة","not_bookmarked":"لقد قمت بقراءة هذه المشاركة مسبقاً. اضغط هنا لحفظها.","last_read":"هذه آخر مشاركة تمت قرائتها. اضغط هنا لحفظها.","remove":"المفضلة","confirm_clear":"هل تود فعلا إزالة كل علامات التفضيل من هذا الموضوع؟"},"topic_count_latest":{"zero":"0 مواضيع جديدة أو محدّثة","one":"موضوع واحد جديد أو محدّث","two":"موضوعان جديدان أو محدّثان","few":"{{count}} مواضيع جديدة أو محدّثة","many":"{{count}} موضوعًا جديدا أو محدّثا","other":"{{count}} موضوع جديد أو محدّث"},"topic_count_unread":{"zero":"0 مواضيع غير مقروءة","one":"موضوع واحد غير مقروء","two":"موضوعان غير مقروءان","few":"{{count}} مواضيع غير مقروءة","many":"{{count}} موضوعًا غير مقروء","other":"{{count}} موضوع غير مقروء"},"topic_count_new":{"zero":"0 مواضيع جديدة","one":"موضوع واحد جديد","two":"موضوعان جديدان","few":"{{count}} مواضيع جديدة","many":"{{count}} موضوعًا جديدًا","other":"{{count}} موضوع جديد"},"click_to_show":"إضغط للعرض.","preview":"معاينة","cancel":"الغاء","save":"حفظ التغييرات","saving":"جارِ الحفظ ...","saved":"تم الحفظ !","upload":"رفع","uploading":"جارِ الرفع...","uploading_filename":"تحديث {{filename}}...","uploaded":"اكتمل الرفع !","enable":"تفعيل","disable":"تعطيل","undo":"تراجع","revert":"عكس","failed":"فشل","switch_to_anon":"وضع التخفي","switch_from_anon":"الخروج من وضع التخفي","banner":{"close":"تعطيل البانر","edit":"تحرير هذا البانر"},"choose_topic":{"none_found":"لم يتم العثور على مواضيع .","title":{"search":"بحث عن موضوع حسب الاسم، رابط أو رقم التعريف (id) :","placeholder":"اكتب عنوان الموضوع هنا"}},"queue":{"topic":"الموضوع :","approve":"الموافقة","reject":"الرفض","delete_user":"حذف المستخدم","title":"تحتاج موافقة","none":"لا يوجد مشاركات لمراجعتها .","edit":"تعديل","cancel":"إلغاء","view_pending":"عرض المشاركات المعلقة","has_pending_posts":{"zero":"  هذا الموضوع \u003cb\u003eلا توجد به مشاركات\u003c/b\u003e بانتظار الموافقة","one":"هذا الموضوع له \u003cb\u003e1\u003c/b\u003e مشاركة بانتظار الموافقة","two":"هذا الموضوع له \u003cb\u003eمشاركتان\u003c/b\u003e بانتظار الموافقة","few":"هذا الموضوع له \u003cb\u003eقليل\u003c/b\u003e من المشاركات بانتظار الموافقة","many":"هذا الموضوع له \u003cb\u003eكثير\u003c/b\u003e من المشاركات بانتظار الموافقة","other":"هذا الموضوع له \u003cb\u003e{{count}}\u003c/b\u003e مشاركات بانتظار الموافقة"},"confirm":"حفظ التعديلات","delete_prompt":"هل أنت متأكد أنك تريد حذف \u003cb\u003e%{username}\u003c/b\u003e؟ هذا سيحذف جميع مشاركاتك ويحظر بريدك الإلكتروني و عنوانك الـIP .","approval":{"title":"المشاركات تحتاج موافقة","description":"لقد استلمنا مشاركتك لكنها تحتاج موافقة المشرف قبل ظهورها. الرجاء الانتظار","pending_posts":{"zero":"ﻻ يوجد مشاركات معلقة.","one":"لديك مشاركة معلقة.","two":"لديك مشاركتين معلقتين.","few":"لديك \u003cstrong\u003e{{count}}\u003c/strong\u003e مشاركات معلقة.","many":"لديك \u003cstrong\u003e{{count}}\u003c/strong\u003e مشاركة معلقة.","other":"لديك \u003cstrong\u003e{{count}}\u003c/strong\u003e مشاركة معلقة."},"ok":"موافق"}},"user_action":{"user_posted_topic":"a href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e مشاركات\u003ca href='{{topicUrl}}'\u003eهذا الموضوع\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eك\u003c/a\u003e مشاركات\u003ca href='{{topicUrl}}'\u003eهذا الموضوع\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e الرد على\u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eأنت\u003c/a\u003e ردودك \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e ردوا على  \u003ca href='{{topicUrl}}'\u003eهذا الموضوع\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eأنت\u003c/a\u003e ردك على \u003ca href='{{topicUrl}}'\u003ethe topic\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e منشن\u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e منشنك\u003ca href='{{user2Url}}'\u003eyou\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eYou\u003c/a\u003e منشن\u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"مشاركة  \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"مشاركتك \u003ca href='{{userUrl}}'\u003e\u003c/a\u003e","sent_by_user":"مرسلة من قبل \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"مرسلة من قبلك \u003ca href='{{userUrl}}'\u003e\u003c/a\u003e"},"directory":{"filter_name":"التصفية باسم العضو","title":"الأعضاء","likes_given":"الإعجابات المعطاة","likes_received":"الإعجابات المستلمة","topics_entered":"المواضيع المدخلة","topics_entered_long":"المواضيع المدخلة","time_read":"وقت القراءة","topic_count":"المواضيع","topic_count_long":"المواضيع المضافة","post_count":"الردود","post_count_long":"الردود المضافة","no_results":"لم يتم العثور على أي نتيجة.","days_visited":"الزيارات","days_visited_long":"أيام الزيارة","posts_read":"المقروءة","posts_read_long":"المشاركات المقروءة","total_rows":{"zero":"0 عضو","one":"عضو واحد","two":"عضوان","few":"%{count} أعضاء","many":"%{count} عضوًا","other":"%{count} عضو"}},"groups":{"add":"اضافة","selector_placeholder":"اضافة عضو","owner":"المالك","visible":"المجموعة مرئية عن جميع المستخدمين","title":{"zero":"مجموعات","one":"مجموعات","two":"مجموعات","few":"مجموعات","many":"مجموعات","other":"مجموعات"},"members":"أعضاء ","posts":"مشاركات","alias_levels":{"title":"الذين يمكنهم استخدام هذه المجموعة كاسم مستعار ؟","nobody":"لا أحد","only_admins":"المسؤولون فقط","mods_and_admins":"فقط المدراء والمشرفون","members_mods_and_admins":"فقط اعضاء المجموعة والمشرفون والمدراء","everyone":"الكل"},"trust_levels":{"title":"مستوى الثقة يمنح تلقائيا للأعضاء عندما يضيفون:","none":"لا شيء"}},"user_action_groups":{"1":"الإعجابات المعطاة","2":"الإعجابات المستلمة","3":"المفضلة","4":"مواضيع","5":"الردود","6":"ردود","7":"إشارات","9":"إقتباسات","10":"تألقت","11":"التعديلات","12":"العناصر المرسلة","13":"البريد الوارد","14":"قيد الانتظار"},"categories":{"all":"جميع التصنيفات","all_subcategories":"جميع","no_subcategory":"لا شيء","category":"تصنيف","reorder":{"title":"إعادة ترتيب الفئات","title_long":"إعادة تنظيم قائمة الفئة","fix_order":"تثبيت الأماكن","fix_order_tooltip":"ليس كل الفئات لديها رقم مكان فريد، ربما يسبب نتيجة غير متوقعة.","save":"حفظ الترتيب","apply_all":"تطبيق","position":"مكان"},"posts":"مشاركات","topics":"مواضيع","latest":"آخر","latest_by":"الاحدث بـ","toggle_ordering":"تبديل التحكم في الترتيب","subcategories":"تصنيفات فرعية","topic_stats":"عدد المواضيع الجديدة","topic_stat_sentence":{"zero":"لا مواضيع جديدة في ال%{unit} الماضي","one":"موضوع واحد جديد في ال%{unit} الماضي","two":"موضوعان جديدان في ال%{unit} الماضي","few":"%{count} مواضيع جديدة في ال%{unit} الماضي","many":"%{count} موضوعًا جديدًا في ال%{unit} الماضي","other":"%{count} موضوع جديد في ال%{unit} الماضي"},"post_stats":"عدد المواضيع الجديدة","post_stat_sentence":{"zero":"لا مشاركات جديدة في ال%{unit} الماضي","one":"مشاركة واحدة جديدة في ال%{unit} الماضي","two":"مشاركتان جديدتان في ال%{unit} الماضي","few":"%{count} مشاركات جديدة في ال%{unit} الماضي","many":"%{count} مشاركة جديدة في ال%{unit} الماضي","other":"%{count} مشاركة جديدة في ال%{unit} الماضي"}},"ip_lookup":{"title":"جدول العناوين ","hostname":"اسم المضيف","location":"الموقع","location_not_found":"(غيرمعرف)","organisation":"المنظمات","phone":"هاتف","other_accounts":"حساب آخر بنفس العنوان","delete_other_accounts":"حذف %{count}","username":"إسم المستخدم","trust_level":"TL","read_time":"وقت القراءة","topics_entered":" مواضيع شوهدت","post_count":"# مشاركات","confirm_delete_other_accounts":"هل أنت متأكد أنك تريد حذف هذا الحساب ؟"},"user_fields":{"none":"(إختر خيار )"},"user":{"said":"{{username}}:","profile":"الصفحة الشخصية","mute":"كتم","edit":"تعديل التفضيلات","download_archive":"تحميل مواضيعي","new_private_message":"رسالة جديدة","private_message":"رسالة","private_messages":"الرسائل","activity_stream":"النشاط","preferences":" التفضيلات","expand_profile":"توسيع","bookmarks":"المفضلة","bio":"معلومات عنّي","invited_by":"مدعو بواسطة","trust_level":"مستوى الثقة","notifications":"الاشعارات","desktop_notifications":{"label":"إشعارات سطح المكتب","not_supported":"عذراً , الإشعارات غير مدعومة على هذا المتصفح ","perm_default":"تفعيل الإشعارات","perm_denied_btn":"الصلاحيات ممنوعة ","perm_denied_expl":"لقد قمت بإيقاف صلاحية الإشعارات في متصفحك  . إستخدم متصفحك لتفعيل التنبيهات و ثم أعد ضغط الزر .\n( سطح المكتب : الأيقونة في أقصى اليسار في شريط العنوان . للهواتف الذكية : في معلومات الموقع Site Info)","disable":"إيقاف الإشعارات ","currently_enabled":"( مفعل مسبقاً )","enable":"تفعيل الإشعارات","currently_disabled":"( مفعل مسبقاً )","each_browser_note":"ملاحظة : يجب انت تقوم بتغيير هذا الإعداد عند كل مرة تستخدم فيها متصفح جديد ."},"dismiss_notifications":"جعل الجميع مقروء","dismiss_notifications_tooltip":"جعل جميع اشعارات غيرمقروء الى مقروء","disable_jump_reply":"لاتذهب الى مشاركتي بعد الرد","dynamic_favicon":"إعرض عدد المواضيع الجديدة والمحدثة في أيقونة المتصفح","edit_history_public":"جعل المستخدمين الاخرين يطلعون على تعديلاتي","external_links_in_new_tab":"إفتح كل الروابط الخارجية في صفحة جديدة","enable_quoting":"فعل خاصية إقتباس النصوص المظللة","change":"تغيير","moderator":"{{user}} مشرف","admin":"{{user}} مدير","moderator_tooltip":"هذا المستخدم مشرف","admin_tooltip":"هذا المستخدم مدير","blocked_tooltip":"هذا المستخدم محظور","suspended_notice":"هذا المستخدم موقوف حتى تاريخ  {{date}}","suspended_reason":"سبب","github_profile":"Github","mailing_list_mode":"استقبال بريد الكتروني لكل مشاركة  جديدة (إلا إذا كتمت الموضوع او التصنيف)","watched_categories":"مراقبة","watched_categories_instructions":"ستتم مراقبة جميع المواضيع الجديدة في هذه التصانيف. سيتم اشعارك بجميع المشاركات والمواضيع الجديدة، بالاضافة الى  عدد المشاركات الجديدة الذي سيظهر بجانب الموضوع.","tracked_categories":"متابعة","tracked_categories_instructions":"ستتم متابعة جميع المواضيع الجديدة في هذه التصانيف. عدد المشاركات الجديدة سيظهر بجانب الموضوع.","muted_categories":"كتم","muted_categories_instructions":"لن يتم إشعارك بأي جديد عن المواضيع الجديدة في هذه التصنيفات، ولن تظهر مواضيع هذه التصنيفات في قائمة المواضيع المنشورة مؤخراً.","delete_account":"حذف الحساب","delete_account_confirm":"هل انت متاكد من انك تريد حذف حسابك نهائيا؟ لايمكن التراجع عن هذا العمل!","deleted_yourself":"تم حذف حسابك بنجاح","delete_yourself_not_allowed":"لايمكنك حذف حسابك الان , تواصل مع المدير ليحذف حسابك ","unread_message_count":"الرسائل","admin_delete":"حذف","users":"الأعضاء","muted_users":"الأعضاء المكتومون","muted_users_instructions":"كتم جميع التنبيهات من هؤلاء الأعضاء.","muted_topics_link":"عرض المواضيع المكتومة","automatically_unpin_topics":"سيتم تلقائيا الغاء تثبيت المواضيع عندما تصل الى الاسفل ","staff_counters":{"flags_given":"علامات مساعدة","flagged_posts":"# مشاركات","deleted_posts":"حذف جميع المشاركات","suspensions":"موقف","warnings_received":"تحذيرات"},"messages":{"all":"الكل","mine":"لي","unread":"غير مقروء"},"change_password":{"success":"(تم ارسال الرسالة)","in_progress":"(يتم ارسال رسالة)","error":"(خطأ)","action":"ارسال اعادة ضبط كلمة المرور على البريد الالكتروني","set_password":" إعادة تعين الرمز السري"},"change_about":{"title":"تعديل معلومات عنّي","error":"حدث خطأ عند تغيير القيمة."},"change_username":{"title":"تغيير اسم المستخدم","confirm":"إذا قمت بتغيير الاسم المستعار، فإن جميع المشاركات التي قمت بالمشاركة بها سيتم الغائها. هل أنت متأكد بقيامك على هذه الخطوة؟","taken":"نأسف، اسم المستخدم مأخوذ.","error":"حدث خطأ عند تغيير اسم المستخدم.","invalid":"اسم المستخدم غير صالح. يجب ان يحتوي على ارقام وحروف فقط "},"change_email":{"title":"تغيير البريد الالكتروني","taken":"نأسف، البريد الالكتروني غير متاح.","error":"حدث خطأ عند تغيير البريد الالكتروني. ربما يكون هذا البريد مستخدم من قبل؟","success":"تم ارسال رسالة الى البريد الكتروني. يرجى اتباع تعليمات التأكيد."},"change_avatar":{"title":"غير صورتك الشخصية","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, based on","gravatar_title":"غير صورتك الشخصية على موقع  Gravatar's.","refresh_gravatar_title":"حدّث Gravatar","letter_based":"الصورة الافتراضية ","uploaded_avatar":"تخصيص صورة","uploaded_avatar_empty":"اضافة صورة ","upload_title":"رفع صورتك ","upload_picture":"رفع الصورة","image_is_not_a_square":"تنبيه: تم اقتصاص جزء من الصورة ، لأنها ليست مربعة الشكل.","cache_notice":"قمت بتغيير صورة العرض بنجاح , لكن قد تتأخر في الظهور لديك ."},"change_profile_background":{"title":"لون خلفية الحساب","instructions":"سيتم وضع خلفية الحساب في المنتصف بعرض 850px"},"change_card_background":{"title":"خلفية المستخدم","instructions":"سيتم وضع الخلفية في المنتصف بعرض 590px"},"email":{"title":"بريد الكتروني","instructions":"لن يتم إظهاره للعامة","ok":"سيتم إرسال رسالة على بريدك الإلكتروني لتأكيد الحساب","invalid":"يرجى إدخال بريد الكتروني فعّال.","authenticated":"تم توثيق بريدك الإلكتروني بواسطة {{provider}}","frequency_immediately":"سيتم ارسال رسالة الكترونية فورا في حال أنك لم الرسائل السابقة","frequency":{"zero":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في آخر {{count}} دقيقة .","one":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في آخر دقيقة .","two":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في آخر دقيقتين .","few":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في {{count}} دقائق  .","many":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في {{count}} دقيقة  .","other":"سنراسلك على بريدك فقط في حال لم تكن متصلا على الموقع في {{count}} دقيقة  ."}},"name":{"title":"الاسم","instructions":"اسمك الكامل (اختياري )","instructions_required":"اسمك كاملاً","too_short":"اسمك قصير جداً.","ok":" .إسمك يبدو جيدا "},"username":{"title":"اسم المستخدم","instructions":"غير مكرر , بدون مسافات , قصير","short_instructions":"يمكن للناس بمنادتك بـ @{{username}}.","available":"اسم المستخدم متاح.","global_match":"البريد الالكتروني مطابق لـ اسم المستخدم المسّجل.","global_mismatch":"مسجل مسبقا ، جرّب {{suggestion}} ؟","not_available":"غير متاح. جرّب {{suggestion}} ؟","too_short":"اسم المستخدم قصير جداً","too_long":"اسم المستخدم طويل جداً","checking":"يتم التاكد من توفر اسم المستخدم...","enter_email":"تم العثور على اسم المستخدم. ادخل البريد الالكتروني المطابق.","prefilled":"البريد الالكتروني مطابق لـ اسم المستخدم المسّجل."},"locale":{"title":"لغة الواجهة","instructions":"لغة الواجهة تغيرت,, التغييرات سيتم تطبيقها في حا تم تحديث الصفحة","default":"(default)"},"password_confirmation":{"title":"اعد كلمة المرور"},"last_posted":" أخر موضوع","last_emailed":"أخر مراسلة","last_seen":"شوهد","created":"إنضم","log_out":"تسجيل الخروج","location":"الموقع","card_badge":{"title":"وسام بطاقة المستخدم"},"website":"موقع الكتروني","email_settings":"بريد الكتروني","email_digests":{"title":"إرسال رسالة إلكترونية تحتوي على جديد الموقع عندما لا أزور الموقع","daily":"يومي","every_three_days":"كل ثلاثة أيام","weekly":"اسبوعي","every_two_weeks":"كل أسبوعين"},"email_direct":"تلقي رسالة إلكترونية عند اقتباس مشاركة لك  أو الرد على عليها أو في حالة ذكر اسمك @username","email_private_messages":"إرسال إشعار بالبريد الإلكتروني عندما يرسل لك شخصاً رسالة خاصة","email_always":"نبهني بوجود رسائل جديدة حتى لو كنت متصل على الموقع .","other_settings":"اخرى","categories_settings":"اقسام","new_topic_duration":{"label":" \nإعتبر المواضيع جديدة في حال","not_viewed":"لم تقم بالاطلاع عليها حتى الآن","last_here":"تم انشائها منذ آخر زيارة لك","after_1_day":"أنشأت في اليوم الماضي","after_2_days":"أنشأت في اليومين الماضيين","after_1_week":"أنشأت في الأسبوع الماضي","after_2_weeks":"أنشأت في الأسبوعين الماضيين"},"auto_track_topics":"متابعة المواضيع التي أدخلها بشكل تلقائي","auto_track_options":{"never":"ابداً","immediately":"حالاً","after_30_seconds":"بعد 30 ثانية","after_1_minute":"بعد 1 دقيقة","after_2_minutes":"بعد 2 دقائق","after_3_minutes":"بعد 3 دقائق","after_4_minutes":"بعد 4 دقائق","after_5_minutes":"بعد 5 دقائق","after_10_minutes":"بعد 10 دقائق"},"invited":{"search":"نوع البحث عن الدعوات","title":"دعوة","user":"المستخدمين المدعويين","sent":"تم الإرسال","none":"لا توجد دعوات معلقة لعرضها.","truncated":{"zero":"لا يوجد دعوات لعرضها.","one":"عرض الدعوة الأولى.","two":"عرض الدعوتان الأولتان.","few":"عرض الدعوات الأولية.","many":"عرض الدعوات {{count}} الأولى.","other":"عرض الدعوات  {{count}} الأولى."},"redeemed":"دعوات مستخدمة","redeemed_tab":"محررة","redeemed_tab_with_count":"({{count}}) محررة","redeemed_at":"مستخدمة","pending":"دعوات قيد الإنتضار","pending_tab":"قيد الانتظار","pending_tab_with_count":"معلق ({{count}})","topics_entered":" مواضيع شوهدت","posts_read_count":"مشاركات شوهدت","expired":"الدعوة انتهت صلاحيتها ","rescind":"حذف","rescinded":"الدعوة حذفت","reinvite":"اعادة ارسال الدعوة","reinvited":"اعادة ارسال الدعوة","time_read":"وقت القراءة","days_visited":"أيام الزيارة","account_age_days":"عمر العضوية بالأيام","create":"ارسال دعوة","generate_link":"انسخ رابط الدعوة","generated_link_message":"\u003cp\u003eرابط الدعوة منح بنجاح!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eرابط الدعوة صالح فقط لعنوان البريد الإلكتروني هذا: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"لم تقم بدعوة اي احد حتى الان. تستطيع ارسال دعوة , أو ارسال عدة دعوات عن طريق\u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003euploading a bulk invite file\u003c/a\u003e.","text":"الدعوة من ملف","uploading":"جاري الرقع...","success":"تم رفع الملف بنجاح, سيتم اشعارك قريبا ","error":"كان هناك مشكلة في رفع الملف  '{{filename}}': {{message}}"}},"password":{"title":"كلمة المرور","too_short":"كلمة المرور قصيرة جداً","common":"كلمة المرور هذه شائعة ","same_as_username":"كلمة المرور مطابقة لاسم المستخدم.","same_as_email":"كلمة المرور مطابقة للبريد الإليكتروني.","ok":"كلمة المرور هذة تعتبر جيدة.","instructions":"على الاقل %{count} حرف"},"associated_accounts":"حساب مرتبط","ip_address":{"title":"أخر عنوان أيبي"},"registration_ip_address":{"title":"ايبي مسجل"},"avatar":{"title":"صورة الملف الشخصي","header_title":"الملف والرسائل والعناوين والتفضيلات."},"title":{"title":"عنوان"},"filters":{"all":"الكل"},"stream":{"posted_by":"ارسلت بواسطة","sent_by":" أرسلت بواسطة","private_message":"رسالة خاصة","the_topic":"موضوع جديد"}},"loading":"يتم التحميل...","errors":{"prev_page":"محاولة تحميل","reasons":{"network":"خطأ في الشبكة","server":"خطأ في السيرفر","forbidden":"غير مصرح","unknown":"خطأ","not_found":"الصفحة غير متوفرة"},"desc":{"network":"الرجاء التحقق من اتصالك","network_fixed":"يبدوا أنه رجع","server":"رقم الخطأ: {{status}}","forbidden":"ليس لديك الصلاحية","not_found":"عفوا، حاول التطبيق حمل URL الغير موجودة.","unknown":"حدث خطأ ما"},"buttons":{"back":"الرجوع","again":"أعد المحاولة","fixed":"تحميل"}},"close":"اغلاق","assets_changed_confirm":"هناك تغيير في الصفحة, هل تريد التحديث للحصول على أحدث نسخة ؟","logout":"تم تسجيل خروجك","refresh":"تحديث","read_only_mode":{"enabled":"وضع القراءة فقط مفعل. يمكنك إكمال تصفح الموقع لكن التفاعلات قد لا تعمل.","login_disabled":"تسجيل الدخول معطل لأن الموقع في خالة القراءة  فقط"},"too_few_topics_and_posts_notice":"دعونا \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eالحصول على هذه المناقشة بدأت!\u003c/a\u003e يوجد حاليا\u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e المواضيع و \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e المشاركات. الزوار الجدد بحاجة إلى بعض الأحاديث لقراءة والرد على.","too_few_topics_notice":"دعونا \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eالحصول على هذه المناقشة التي!\u003c/a\u003e وهناك حاليا \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e المواضيع. الزوار الجديدة بحاجة إلى بعض الأحاديث قراءة والرد عليها.","too_few_posts_notice":"دعونا \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eالحصول على هذه المناقشة التي بدأت!\u003c/a\u003e يوجد حاليا \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e مشاركات. الزوار الجديدة بحاجة إلى بعض الأحاديث قراءة والرد عليها.","learn_more":"تعلم المزيد...","year":"سنة","year_desc":"المواضيع المكتوبة خلال 365 يوم الماضية","month":"الشهر","month_desc":"المواضيع المكتوبة خلال 30 يوم الماضية","week":"أسبوع","week_desc":" المواضيع التي كتبت خلال 7 أيام الماضية","day":"يوم","first_post":"الموضوع الأول","mute":"كتم","unmute":"إلغاء الكتم","last_post":"أخر مشاركة","last_reply_lowercase":"آخر رد","replies_lowercase":{"zero":"رد","one":"رد","two":"ردود","few":"ردود","many":"ردود","other":"ردود"},"signup_cta":{"sign_up":"إشترك","hide_session":"ذكرني غدا","hide_forever":"لا شكرا","hidden_for_session":"حسنا، أنا اسأل لك غدا. يمكنك دائماً استخدام '\"تسجيل الدخول\"' لإنشاء حساب، أيضا.","intro":"لحظة ! :heart_eyes: يبدو أنك مهتم بهذه المناقشة، لكنك لم تقم بالتسجيل  للحصول على حساب .","value_prop":"عندما تنشئ حساب، ننحن نتذكر ما كنت تقرأه بالضبط، و سترجع دائما في المكان الذي تركته، و ستصلك الاشعارات ايضا، هنا و عبر البريد الإلكتروني، في اي وقت ينشأ  فيه منشور جديد، و تستطيع أن تُعجب بالمنشورارت لتشارك ما يعجبك :heartbeat:"},"summary":{"enabled_description":"أنت تنظر الى ملخص لهذا الموضوع , مشاركات مثيرة للإهتمام بحسب رأي المجتمع","description":"هناك  \u003cb\u003e{{count}}\u003c/b\u003e ردود","description_time":"هناك  \u003cb\u003e{{count}}\u003c/b\u003e ردود مع تقدير وقت القراءة \u003cb\u003e{{readingTime}} دقائق\u003c/b\u003e.","enable":"لخّص هذا الموضوع","disable":"عرض جميع المشاركات"},"deleted_filter":{"enabled_description":"هذا الموضوع يحوي على مشاركات محذوفة تم اخفائها ","disabled_description":"المشاركات المحذوفة في هذا الموضوع  ممكن مشاهدتها ","enable":"إخفاء المشاركات المحذوفة","disable":"عرض المشاركات المحذوفة"},"private_message_info":{"title":" رسالة خاصة","invite":" إدعو اخرين","remove_allowed_user":"هل تريد حقا ازالة  {{name}} من الرسائل الخاصة ؟"},"email":"البريد الإلكتروني","username":"إسم المستخدم","last_seen":"شوهدت","created":"مكتوبة","created_lowercase":"منشأة","trust_level":"مستوى التقة","search_hint":"اسم مستخدم او بريد الكتروني او عنوان ايبي","create_account":{"title":"إنشاء حساب جديد","failed":"حدث خطأ ما, ربما بريدك الالكتروني مسجل مسبقا, جرب رابط نسيان كلمة المرور "},"forgot_password":{"title":" إعادة تعيين كلمة المرور","action":"نسيت كلمة المرور","invite":"ادخل اسم مستخدمك او بريدك الالكتروني وسنقوم بإرسال اعاذة ضبط كلمة المرور على بريدك","reset":" إعادة تعين الرمز السري","complete_username":"اذا كان اسم المسنخدم موجود  \u003cb\u003e%{username}\u003c/b\u003e, سيتم ارسال رسالة لبريدك لإعادة ضبط كلمة المرور ","complete_email":"اذا كان الحساب متطابق \u003cb\u003e%{email}\u003c/b\u003e, سوف تستلم بريد الالكتروني يحوي على التعليمات لإعادة ضبط كلمة المرور","complete_username_found":"وجدنا حساب متطابق مع المستخدم  \u003cb\u003e%{username}\u003c/b\u003e, سوف تستلم بريد الالكتروني يحوي على التعليمات لإعادة ضبط كلمة المرور","complete_email_found":"وجدنا حساب متطابق مع  \u003cb\u003e%{email}\u003c/b\u003e, سوف تستلم بريد الالكتروني يحوي على التعليمات لإعادة ضبط كلمة المرور","complete_username_not_found":"لايوجد حساب متطابق مع هذا المستخدم  \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"لايوجد حساب متطابق مع  \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"تسجيل دخول","username":"المستخدم","password":"الرمز السري","email_placeholder":"البريد الإلكتروني أو إسم المستخدم","caps_lock_warning":"Caps Lock is on","error":"مشكل غير معروف","rate_limit":"الرجاء اﻹنتظارقبل محاولة تسجيل الدخول مجدداً.","blank_username_or_password":"أدخل اسم المستخدم أو البريد الإلكتروني و كلمة المرور.","reset_password":" إعادة تعيين الرمز السري","logging_in":"...تسجيل الدخول ","or":"أو ","authenticating":" ... جاري التأكد","awaiting_confirmation":"لازال حسابك غير فعال حتى هذه اللحظة، استخدم خيار \"نسيان كلمة المرور\" لإرسال رابط تفعيل آخر.","awaiting_approval":"لم يتم الموافقة على حسابك، سيتم إرسال بريد إلكتروني عندما تتم الموافقة.","requires_invite":"المعذرة، الوصول لهذا الموقع خاص بالمدعويين فقط.","not_activated":"لا يمكنك تسجيل الدخول. لقد سبق و أن أرسلنا بريد إلكتروني إلى \u003cb\u003e{{sentTo}}\u003c/b\u003e لتفعيل حسابك. الرجاء اتباع التعليمات المرسلة لتفعيل الحساب.","not_allowed_from_ip_address":"لا يمكنك تسجيل الدخول من خلال هذا العنوان الرقمي - IP.","admin_not_allowed_from_ip_address":"لا يمكنك تسجيل الدخول كمدير من خلال هذا العنوان الرقمي - IP.","resend_activation_email":"اضغط هنا لإرسال رسالة إلكترونية أخرى لتفعيل الحساب.","sent_activation_email_again":"لقد سبق وأن تم إرسال رسالة إلكترونية إلى \u003cb\u003e{{currentEmail}}\u003c/b\u003e لتفعيل حسابك. تأكد من مجلد السبام في بريدك.","to_continue":"الرجاء تسجيل الدخول...","preferences":"يتوجب عليك تسجيل الدخول لتغيير إعداداتك الشخصية.","forgot":"لا أذكر معلومات حسابي","google":{"title":"مع جوجل","message":"التحقق من خلال حساب جوجل ( الرجاء التأكد من عدم تشغيل مانع الاعلانات المنبثقة في المتصفح)"},"google_oauth2":{"title":"بواسطة Google","message":"تسجيل الدخول باستخدام حسابك في Google ( تأكد أن النوافذ المنبثقة غير ممنوعة في متصفحك)"},"twitter":{"title":"مع تويتر","message":"التحقق من خلال حساب تويتر ( الرجاء التأكد من عدم تشغيل مانع الاعلانات المنبثقة في المتصفح)"},"facebook":{"title":"مع الفيسبوك","message":"التحقق من خلال حساب الفيس بوك ( الرجاء التأكد من عدم تشغيل مانع الاعلانات المنبثقة في المتصفح)"},"yahoo":{"title":"مع ياهو","message":"التحقق من خلال حساب ياهو ( الرجاء التأكد من عدم تشغيل مانع الاعلانات المنبثقة في المتصفح)"},"github":{"title":"مع جيتهب","message":"التحقق من خلال حساب جيتهب ( الرجاء التأكد من عدم تشغيل مانع الاعلانات المنبثقة في المتصفح)"}},"apple_international":"ابل","google":"جوجل","twitter":"تويتر","emoji_one":"تعبيرات","shortcut_modifier_key":{"shift":"العالي","ctrl":"التحكم","alt":"Alt"},"composer":{"emoji":"تعبيرات: ابتسامة","more_emoji":"أكثر...","options":"خيارات","whisper":"همس","add_warning":"هذا تحذير رسمي","toggle_whisper":"تبديل الهمس","posting_not_on_topic":"أي موضوع تود الرد عليه؟","saving_draft_tip":"جار الحفظ...","saved_draft_tip":"تم الحفظ","saved_local_draft_tip":"تم الحفظ محلياً","similar_topics":"موضوعك مشابه لـ ...","drafts_offline":"مسودات محفوظة ","error":{"title_missing":"العنوان مطلوب","title_too_short":"العنوان يجب أن يكون اكثر  {{min}} حرف","title_too_long":"العنوان يجب أن لا يكون أكثر من  {{max}} حرف","post_missing":"لا يمكن للمشاركة أن تكون خالية","post_length":"التعليق يجب أن يكون أكثر  {{min}} حرف","try_like":"هل جربت زر \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e ؟","category_missing":"يجب عليك اختيارتصنيف"},"save_edit":"حفظ التحرير","reply_original":"التعليق على الموضوع الاصلي","reply_here":"الرد هنا","reply":"الرد","cancel":"إلغاء","create_topic":"إنشاء موضوع","create_pm":"رسالة","title":"او اضغط على Ctrl+Enter","users_placeholder":"اضافة مستخدم","title_placeholder":"ما هو الموضوع المراد مناقشته في جملة واحدة ؟","edit_reason_placeholder":"لمذا تريد التعديل ؟","show_edit_reason":"(اضف سبب التعديل)","reply_placeholder":"أكتب هنا. استخدم Markdown, BBCode, أو HTML للتشكيل. اسحب أو الصق الصور.","view_new_post":"الاطلاع على أحدث مشاركاتك","saving":"جارِ الحفظ","saved":"تم الحفظ","saved_draft":"جاري إضافة المسودة. اضغط للاستئناف","uploading":"يتم الرفع...","show_preview":"أعرض المعاينة \u0026raquo;","hide_preview":"\u0026laquo; اخف المعاينة","quote_post_title":"اقتبس كامل المشاركة","bold_title":"عريض","bold_text":"نص عريض","italic_title":"مائل","italic_text":"نص مائل","link_title":"الرابط","link_description":"ادخل وصف الرابط هنا ","link_dialog_title":"اضف الرابط","link_optional_text":"عنوان اختياري","link_placeholder":"http://example.com \"نص إختياري\"","quote_title":"اقتباس فقرة","quote_text":"اقتباس فقرة","code_title":"المحافظة على التنسيق","code_text":"اضف 4 مسافات اول السطر قبل النص المنسق","upload_title":"رفع","upload_description":"ادخل وصف الرفع هنا","olist_title":"قائمة مرقمة","ulist_title":"قائمة ","list_item":"قائمة العناصر","heading_title":"عنوان","heading_text":"عنوان","hr_title":"خط افقي","help":"مساعدة في رموز التنسيق","toggler":"اخف او اظهر صندوق التحرير","modal_ok":"موافق","modal_cancel":"إلغاء","cant_send_pm":"عذرا ، لا يمكنك ان ترسل رسالة الى %{username} .","admin_options_title":"اختياري اضافة اعدادات الموضوع","auto_close":{"label":"وقت الإغلاق التلقائي للموضوع","error":"يرجى ادخال قيمة صحيحة","based_on_last_post":"لاتغلق الموضوع حتى تكون آخر مشاركة بهذا القدم ","all":{"examples":"أدخل رقم الساعة (24) . الوقت (17:30) . او التاريخ (2013-11-22 14:00)."},"limited":{"units":"(# من الساعات)","examples":"أدخل الساعة (24)"}}},"notifications":{"title":"الإشعار عندما يتم ذكر @name , أو الردود على مواضيعك أو مشاركاتك أو الرسالة الخاصة ...إلخ","none":"لا يمكن عرض الإشعارات في الوقت الحالي.","more":"إظهار إشعارات قديمة","total_flagged":"مجموع المشاركات المعلّم عليها","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e نقل{{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eاستحق'{{description}}'\u003c/p\u003e","alt":{"mentioned":"مؤشرة بواسطة","quoted":"مقتبسة بواسطة","replied":"مجاب","posted":"مشاركة بواسطة","edited":"تم تعديل مشاركتك بواسطة","liked":"تم الإعجاب بمشاركتك","private_message":"رسالة خاصة من","invited_to_private_message":"تمت الدعوة لرسالة خاصة من ","invited_to_topic":"تمت الدعوة لموضوع من ","invitee_accepted":"قبلت الدعوة بواسطة","moved_post":"مشاركتك نقلت بواسطة","linked":"رابط لمشاركتك","granted_badge":"تم منح الوسام"},"popup":{"mentioned":"{{username}} أشار لك في \"{{topic}}\" - {{site_title}}","quoted":"{{username}} نقل لك في \"{{topic}}\" - {{site_title}}","replied":"{{username}} رد لك في \"{{topic}}\" - {{site_title}}","posted":"{{username}} شارك في \"{{topic}}\" - {{site_title}}","private_message":"{{username}} أرسل لك رسالة خاصة في \"{{topic}}\" - {{site_title}}","linked":"{{username}} رتبط بمشاركتك من \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"اضف صورة","title_with_attachments":"اضف صورة او ملف","from_my_computer":"عن طريق جهازي","from_the_web":"عن طريق الويب","remote_tip":"رابط لصورة","remote_tip_with_attachments":"رابط لصورة أو ملف {{authorized_extensions}}","local_tip":"إختر صور من جهازك .","local_tip_with_attachments":"اختيار صور او ملفات من جهازك {{authorized_extensions}}","hint":"(تستطيع أيضا أن تسحب و تفلت ملف أو صورة في المحرر لرفعه)","hint_for_supported_browsers":"يمكنك أيضا سحبوإفلات أو لصق الصور إلى المحرر","uploading":"يتم الرفع","select_file":"تحديد ملف","image_link":"رابط ستشير له الصورة"},"search":{"sort_by":"ترتيب حسب","relevance":"أهمية","latest_post":"آخر مشاركات","most_viewed":"الأكثر مشاهدة","most_liked":"الأكثر إعجابا","select_all":"أختر الكل","clear_all":"إلغ إختيار الكل","result_count":{"zero":"{{count}} لا نتائج \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","one":"{{count}} نتيجة \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","two":"{{count}} 2 نتائج \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","few":"{{count}} النتائج \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","many":"{{count}} النتائج \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} النتائج \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"البحث في المواضيع أو الردود أو الأعضاء أو التصنيفات","no_results":"لم يتم العثور على نتائج للبحث","no_more_results":"لا يوجد نتائج إضافية .","search_help":"بحث عن المساعدة","searching":"جاري البحث ...","post_format":"#{{post_number}} بواسطة {{username}}","context":{"user":"البحث عن مواضيع @{{username}}","category":"البحث في التصنيف \"{{category}}\"","topic":"بحث في هذا الموضوع","private_messages":"البحث في الرسائل الخاصة"}},"hamburger_menu":"أذهب لقائمة موضوع أخر أو فئة","new_item":"جديد","go_back":"الرجوع","not_logged_in_user":"صفحة المستخدم مع ملخص عن نشاطه و إعداداته","current_user":"الذهاب إلى صفحتك الشخصية","topics":{"bulk":{"unlist_topics":"ازالة المواضيع من القائمة","reset_read":"تصفير القراءات","delete":"المواضيع المحذوفة","dismiss":"إخفاء","dismiss_read":"تجاهل المشاركات غير المقروءة","dismiss_button":"تجاهل...","dismiss_tooltip":"تجاهل فقط المشاركات الجديدة او توقف عن تتبع المواضيع","also_dismiss_topics":"هل تريد التوقف عن تتبع هذه المواضيع ؟ (هذه المواضيع لن تظهر في قسم المواضيع غير المقروءة)","dismiss_new":"إخفاء الجديد","toggle":"إيقاف/تشغيل الاختيار المتعدد للمواضيع","actions":"عمليات تنفذ دفعة واحدة","change_category":"تغيير التصنيف","close_topics":"إغلاق المواضيع","archive_topics":"أرشفة المواضيع","notification_level":"تغيير مستوى الإشعارات","choose_new_category":"اختر التصنيف الجديد للمواضيع:","selected":{"zero":"لم تختر أيّ موضوع.","one":"لقد اخترت موضوعًا واحدًا.","two":"لقد اخترت موضوعين اثنين.","few":"لقد اخترت \u003cb\u003e{{count}}\u003c/b\u003e مواضيع.","many":"لقد اخترت \u003cb\u003e{{count}}\u003c/b\u003e موضوعًا.","other":"لقد اخترت \u003cb\u003e{{count}}\u003c/b\u003e موضوع."}},"none":{"unread":"لا يوجد لديك مواضيع غير مقروءة","new":"لا يوجد لديك مواضيع جديدة","read":"لم تقرأ أي موضوع حتى الآن","posted":"لم تقم بإضافة أي موضوع حتى الآن","latest":"لا يوجد مشاركات حديثة .. مع الأسف :(","hot":"الهدوء يعم المكان.","bookmarks":"ليس لديك مواضيع في المفضلة.","category":"لا يوجد مواضيع في التصنيف {{category}}","top":"لا يوجد مواضيع تستحق أن تكون ضمن الأفضل مع الأسف.","search":"لا يوجد نتائج للبحث.","educate":{"new":"\u003cp\u003eمواضيعك الجديدة ستظهر هنا.\u003c/p\u003e\u003cp\u003e بشكل افتراضي ، كل المواضيع ستعتبر جديدة و تحمل الوسم \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003e جديد \u003c/span\u003e إذا تمت كتابتها قبل يومين على الأكثر.\u003c/p\u003e\u003cp\u003e تستطيع ان تغير المدة من \u003ca href=\"%{userPrefsUrl}\"\u003e إعداداتك \u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eالمواضيع الغير مقروءة ستظهر هنا\u003c/p\u003e\u003cp\u003e افتراضياً, سيتم اعتبارالمواضيع غير مقروءة وتحمل الوسم \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e إذا:\u003c/p\u003e\u003cul\u003e\u003cli\u003e كتبت موضوع جديد\u003c/li\u003e\u003cli\u003e رددت على موضوع\u003c/li\u003e\u003cli\u003eقرأت موضوع لأكثر من 4 دقائق.\u003c/li\u003e\u003c/ul\u003e\u003cp\u003e أو إذا قمت باختيار خيار تتبع موضوع أو إضافته للمواضيع المراقبة من خلال لوحة التحكم بالإشعارات.\u003c/p\u003e\u003cp\u003e تستطيع تغيير الإعدادات من خلال \u003ca href=\"%{userPrefsUrl}\"\u003e إعداداتك\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"لا يوجد المزيد من المواضيع الحديثة","hot":"هذه كل المواضيع التي عليها إقبال عالي حتى هذه اللحظة","posted":"لا يوجد مواضيع أخرى.","read":"لا يوجد المزيد من المواضيع المقروءة","new":"لا يوجد المزيد من المواضيع الجديدة","unread":"لا يوجد المزيد من المواضيع الغير مقروءة","category":"لا يوجد مواضيع أخرى في التصنيف {{category}}","top":"لقد اطلعت على كل المواضيع المميزة حتى هذه اللحظة.","bookmarks":"لايوجد المزيد من المواضيع في المفضلة","search":"لايوجد نتائج بحث أخرى يمكن عرضها"}},"topic":{"unsubscribe":{"stop_notifications":"ستستقبل الأن إشعارات أقل لـ\u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"حالة إشعارك الحالي هي "},"filter_to":"{{post_count}} مشاركات/مشاركة في الموضوع","create":"موضوع جديد","create_long":"كتابة موضوع جديد","private_message":"أرسل رسالة خاصة","list":"المواضيع","new":"موضوع جديد","unread":"غير مقروء","new_topics":{"zero":"0 موضوع جديد","one":"موضوع واحد جديد","two":"موضوعان جديدان","few":"{{count}} مواضيع جديدة","many":"{{count}} موضوعًا جديدًا","other":"{{count}} موضوع جديد"},"unread_topics":{"zero":"0 موضوع غير مقروء","one":"موضوع واحد غير مقروء","two":"موضوعان غير مقروءان","few":"{{count}} مواضيع غير مقروءة","many":"{{count}} موضوعًا غير مقروء","other":"{{count}} موضوع غير مقروء"},"title":"موضوع","invalid_access":{"title":"الموضوع خاص","description":"لا تملك صلاحيات للوصول لهذا الموضوع","login_required":"عليك تسجيل الدخول لمشاهدة الموضوع"},"server_error":{"title":"حدث خطأ أثناء عرض الموضوع","description":"للأسف، لا يمكن عرض الموضوع ، ربما تكون مشكلة في الاتصال. يرجى المحاولة مرة أخرى، إذا استمرت المشكلة يرجى التواصل معنا ."},"not_found":{"title":"لم يتم العثور على الموضوع","description":"للأسف، لم نتمكن من إيجاد الموضوع. يمكن تم حذفه من قبل المشرف."},"total_unread_posts":{"zero":"لديك 0 مشاركة غير مقروءة في هذا الموضوع","one":"لديك مشاركة واحدة غير مقروءة في هذا الموضوع","two":"لديك مشاركتان غير مقروءتان في هذا الموضوع","few":"لديك {{count}} مشاركات غير مقروءة في هذا الموضوع","many":"لديك {{count}} مشاركة غير مقروءة في هذا الموضوع","other":"لديك {{count}} مشاركة غير مقروءة في هذا الموضوع"},"unread_posts":{"zero":"لديك 0 مشاركة قديمة غير مقروءة في هذا الموضوع","one":"لديك مشاركة واحدة قديمة غير مقروءة في هذا الموضوع","two":"لديك مشاركتان قديمتان غير مقروءتان في هذا الموضوع","few":"لديك {{count}} مشاركات قديمة غير مقروءة في هذا الموضوع","many":"لديك {{count}} مشاركة قديمة غير مقروءة في هذا الموضوع","other":"لديك {{count}} مشاركة قديمة غير مقروءة في هذا الموضوع"},"new_posts":{"zero":"لا يوجد مشاركات جديدة في هذا الموضوع منذ اخر زيارة لك","one":"هناك مشاركة جديدة واحدة في هذا الموضوع منذ اخر زيارة لك","two":"هناك مشاركتان جديدتان في هذا الموضوع منذ اخر زيارة لك","few":"هناك {{count}} مشاركات جديدة في هذا الموضوع منذ اخر زيارة لك","many":"هناك {{count}} مشاركة جديدة في هذا الموضوع منذ اخر زيارة لك","other":"هناك {{count}} مشاركة جديدة في هذا الموضوع منذ اخر زيارة لك"},"likes":{"zero":"لا يوجد استحسانات في هذا الموضوع","one":"هناك استحسان واحد في هذا الموضوع","two":"هناك استحسانان اثنان في هذا الموضوع","few":"هناك {{count}} استحسانات في هذا الموضوع","many":"هناك {{count}} استحسانًا في هذا الموضوع","other":"هناك {{count}} استحسان في هذا الموضوع"},"back_to_list":"العودة لقائمة المواضيع","options":"خيارات الموضوع","show_links":"إظهار الروابط في هذا الموضوع","toggle_information":"إظهار/إخفاء تفاصيل الموضوع","read_more_in_category":"ترغب في قراءة المزيد؟ استعرض مواضيع أخرى في {{catLink}} أو {{latestLink}}.","read_more":"ترغب في قراءة المزيد؟ {{catLink}} أو {{latestLink}}.","browse_all_categories":"استعرض جميع التصنيفات","view_latest_topics":"شاهد آخر المواضيع","suggest_create_topic":"ما رأيك أن تكتب موضوعاً جديداً ؟","jump_reply_up":"الذهاب إلى أول رد","jump_reply_down":"الذهاب إلى آخر رد","deleted":"الموضوع محذوف","auto_close_notice":"سيتم إغلاق الموضوع آليا بعد %{timeLeft}","auto_close_notice_based_on_last_post":"سيتم إغلاق هذا الموضوع بعد %{duration} من آخر رد.","auto_close_title":"إعدادات الإغلاق التلقائي","auto_close_save":"حفظ","auto_close_remove":"لا تغلق هذا الموضوع تلقائياً","progress":{"title":"حالة الموضوع","go_top":"أعلى","go_bottom":"أسفل","go":"اذهب","jump_bottom":"الذهاب لأخر مشاركة","jump_bottom_with_number":"الذهاب إلى الرد %{post_number}","total":"مجموع المشاركات","current":"المشاركة الحالية","position":"المشاركة %{current} من أصل %{total}"},"notifications":{"reasons":{"3_6":"سيصلك إشعارات لأنك اخترت أن تتابع هذا التصنيف","3_5":"سيصلك إشعارات لأنك اخترت أن تتابع هذا الموضوع بشكل تلقائي.","3_2":"سيصلك إشعارات لأنك اخترت أن تتابع هذا الموضوع.","3_1":"سيصلك إشعارات لأنك أنت من أنشأ هذا الموضوع.","3":"سيصلك إشعارات لأنك اخترت أن تتابع هذا الموضوع.","2_8":"سيصلك إشعارات لأنك اخترت تتبع هذا التصنيف","2_4":"سيصلك إشعارات لأنك أضفت مشاركة لهذا الموضوع.","2_2":"سيصلك إشعارات لأنك اخترت متابعة الموضوع","2":"سيصلك إشعار لأنك  \u003ca href=\"/users/{{username}}/preferences\"\u003eقرأت هذا الموضوع\u003c/a\u003e.","1_2":".سيتم إشعارك إذا ذكر أحد ما @name أو رد على مشاركاتك","1":".سيتم إشعارك إذا ذكر أحد ما @name أو رد على مشاركاتك","0_7":"لن يصلك أي إشعار يخص هذا التصنيف بناء على طلبك.","0_2":"لن يصلك أي إشعار يخص هذا الموضوع بناء على طلبك.","0":"لن يصلك أي إشعار يخص هذا الموضوع بناء على طلبك."},"watching_pm":{"title":"تحت المتابعة","description":"سيتم إشعارك بأية رد على هذه الرسالة، وبعدد الردود الجديدة التي ستظهر ."},"watching":{"title":"تحت المتابعة","description":"سيتم إشعارك بأية رد على هذا الموضوع، وبعدد الردود الجديدة التي ستظهر."},"tracking_pm":{"title":"متتبعة","description":"سيتم عرض عدد الردود الجديدة لهذه الرسالة. سيتم إعلامك إذا ذكر أحد اسمك@  أو ردود لك."},"tracking":{"title":"تحت المتابعة","description":"سيتم عرض عدد الردود جديدة لهذا الموضوع. سيتم إعلامك إذا ذكر أحد name@  أو ردود لك."},"regular":{"title":"منتظم","description":".سيتم إشعارك إذا ذكر أحد ما @اسمك أو رد لك"},"regular_pm":{"title":"منتظم","description":"سيتم تنبيهك إذا قام احدٌ بالاشارة إلى حسابك @name أو الرد عليك."},"muted_pm":{"title":"كتم","description":"لن يتم إشعارك بأي جديد يخص هذه الرسالة الخاصة."},"muted":{"title":"مكتوم","description":"لن يتم إشعارك بأي جديد يخص هذا الموضوع ولن يظهرهذا الموضوع في قائمة المواضيع المنشورة مؤخراً."}},"actions":{"recover":"استرجاع الموضوع","delete":"حذف الموضوع","open":"كتابة موضوع","close":"إغلاق الموضوع","multi_select":"اختر مشاركات","auto_close":"إغلاق تلقائي","pin":"تثبيت الموضوع","unpin":"إلغاء تثبيت الموضوع","unarchive":"التراجع عن أرشفة الموضوع","archive":"أرشفة الموضوع","invisible":"إزالة من القائمة","visible":"إضافة ضمن القائمة","reset_read":"تصفير القراءات"},"feature":{"pin":"تثبيت مواضيع","unpin":"إلغاء تثبيت مواضيع","pin_globally":"تثبيت الموضوع على عموم الموقع","make_banner":"موضوع دعائي","remove_banner":"إزالة موضوع دعائي"},"reply":{"title":"الرد","help":"البدء بالرد على هذا الموضوع"},"clear_pin":{"title":"إلغاء التثبيت","help":"إلغاء تثبيت الموضوع حتى لا يظهر في أعلى القائمة"},"share":{"title":"مشاركة","help":"شارك برابط يشير لهذا الموضوع"},"flag_topic":{"title":"إبلاغ","help":"قم بمتابعة هذا الموضوع بشكل خاص حيث سيصلك تنبيهات عليها ","success_message":"تم الإبلاغ عن الموضوع"},"feature_topic":{"title":"ترشيح هذا الموضوع","pin":"جعل هذا الموضوع يظهر في أعلى فئة {{categoryLink}} حتى ","confirm_pin":"لديك مسبقاً {{count}} مواضيع معلقة. قد تكون كثرة المواضيع المعلقة عبئاً على لمستخدمين الجدد والزوار. هل أنت متأكد أنك تريد تعليق موضوع آخر في هذه الفئة؟","unpin":"ازالة هذا الموضوع من أعلى هذه الفئة {{categoryLink}}.","unpin_until":"ازالة هذا الموضوع من أعلى فئة {{categoryLink}} أو إنتظر حتى \u003cstrong\u003e %{until} \u003cstrong/\u003e","pin_note":"المستخدمون يستطعون إزالة تثبيت الموضوع بشكل خاص بهم.","pin_validation":"التاريخ مطلوب لتثبيت هذا الموضوع.","not_pinned":"ﻻيوجد مواضيع مثبتة في {{categoryLink}}.","already_pinned":{"zero":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","one":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","two":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","few":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","many":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","other":"المواضيع مثبتة حالياً في {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":" جعل هذا الموضوع يظهر في أعلى جميع القوائم الموضوع.","confirm_pin_globally":"لديك بالفعل {{count}} الموضوعات معقود على الصعيد العالمي. قد تكون عدة مواضيع معلقة عبئا للمستخدمين الجدد والمجهولين. هل أنت متأكد أنك تريد يعلقون موضوع آخر على الصعيد العالمي؟","unpin_globally":"إزالة هذا الموضوع من أعلى لجميع القوائم الموضوع.","unpin_globally_until":"أزل هذا الموضوع من أعلى قوائم الموضوعاتاو إنتظر حتى : \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"يمكن للمستخدمين بفصل موضوع على حدة لأنفسهم. ","not_pinned_globally":"لا توجد مواضيع مثبته عموما","already_pinned_globally":{"zero":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","one":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","two":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","few":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","many":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e","other":"مواضيع مثبتة حاليا : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"أجعل هذا الموضوع يظهر في الإشعار في أعلى كل الصفحة.","remove_banner":"إزالة الإشعار الذي يظهر في اعلى الصفحات","banner_note":"المستخدمون يستطعون إبعاد الشعار بأغلاقه. موضوع واحد فقط يبقى كشعار لأي وقت معطى.","no_banner_exists":"لا يوجد اشعار للموضوع","banner_exists":"شعار الموضوع \u003cstrong class='badge badge-notification unread'\u003eهناك\u003c/strong\u003e حاليا."},"inviting":"دعوة...","automatically_add_to_groups_optional":"هذه الدعوة تتضمن صلاحيات الدخول على المجموعات : (اختياري , مدير فقط )","automatically_add_to_groups_required":"هذه الدعوة تتضمن صلاحيات الدخول على هذه المجموعات: (\u003cb\u003eيتطلب \u003c/b\u003e, مدير","invite_private":{"title":"رسالة دعوة","email_or_username":"دعوات عن طريق اسم المستخدم او البريد الالكتروني","email_or_username_placeholder":"البريد الإلكتروني أو إسم المستخدم","action":"دعوة","success":"لقد دعونا ذلك المستخدم للمشاركة في هذه الرسالة.","error":"للأسف, حدثت مشكلة في دعوة المستخدم","group_name":"اسم المجموعة"},"invite_reply":{"title":"دعوة","username_placeholder":"اسم المستخدم","action":"ارسال دعوة","help":"دعوة المستخدمين لهذا الموضوع عن طرق البريد الإلكتروني أو الأشعارات","to_forum":"سيتم ارسال رسالة بريد الكتروني ﻷصدقائك للمشاركة في الموقع , هذه العملية لا تتطلب تسجيل الدخول .","sso_enabled":"أدخل أسم الشخص الذي ترغب  بدعوته لهذا الموضوع","to_topic_blank":"أدخل أسم الشخص أو عنوان بريده الإلكتروني لدعوته لهذا الموضوع","to_topic_email":"لقد ادخلت عنوان البريد إلإلكتروني. سنقوم بإرسال دعوة تسمح لصديقك بالرد حالاً على هذا الموضوع.","to_topic_username":"لقد ادخلت اسم المستحدم. سنقوم بإرسال إشعار يحتوي على رابط دعوة إلى الموضوع.","to_username":"ضع اسم المستخدم للشخص الذي تريد دعوته. سنقوم بإرسال إشعار يحتوي على رابط دعوة إلى الموضوع.","email_placeholder":"name@example.com","success_email":"قمنا بإرسال دعوة بالبريد لـ \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e . سيتم تنبيهك عند قبول الدعوة , تحقق من تبويب الدعوات في صفحتك الشخصية لمتابعة دعوتك.","success_username":"دعونا عضو للمشاركة في هذا الموضوع.","error":"نأسف لا يمكنك دعوة هذا المُستَخدم , ربما لأنه مُسَجِل لدينا مسبقاً (الدعوات محدودة)"},"login_reply":"سجل دخولك لرد","filters":{"n_posts":{"zero":"لا يوجد مشاركات.","one":"مشاركة واحدة.","two":"مشاركتان.","few":"مشاركات قليلة.","many":"مشاركات كثيرة.","other":"{{count}} مشاركات."},"cancel":"حذف التخصيص"},"split_topic":{"title":"موضوع جديد","action":"موضوع جديد","topic_name":"اسم الموضوع","error":"هناك مشكلة في نقل المشاركات الى الموضوع الجديد","instructions":{"zero":"أنت على وشك انشاء موضوع جديد, ولم يتم اختيار أي مشاركة لتعبئته.","one":"أنت على وشك انشاء موضوع جديد وتعبئته بمشاركة اخترتها.","two":"أنت على وشك انشاء موضوع جديد وتعبئته بـمشاركاتين اخترتها.","few":"أنت على وشك انشاء موضوع جديد وتعبئته بـ \u003cb\u003e{{count}}\u003c/b\u003e مشاركات اخترتها.","many":"أنت على وشك انشاء موضوع جديد وتعبئته بـ \u003cb\u003e{{count}}\u003c/b\u003e مشاركة اخترتها.","other":"أنت على وشك انشاء موضوع جديد وتعبئته بـ \u003cb\u003e{{count}}\u003c/b\u003e مشاركة اخترتها."}},"merge_topic":{"title":"الانتقال الى موضوع موجود","action":"الانتقال الى موضوع موجود","error":"هناك خطأ في نقل هذه المشاركات الى هذا الموضوع","instructions":{"zero":"لم يتم اختيار أي مشاركة لنقلها !","one":"الرجاء اختيار الموضوع الذي تود نقل المشاركة إليه.","two":"الرجاء اختيار الموضوع الذي تود نقل المشاركتين إليه.","few":"الرجاء اختيار الموضوع الذي تود نقل الـ\u003cb\u003e{{count}}\u003c/b\u003e مشاركات إليه.","many":"الرجاء اختيار الموضوع الذي تود نقل الـ\u003cb\u003e{{count}}\u003c/b\u003e مشاركة إليه.","other":"الرجاء اختيار الموضوع الذي تود نقل الـ\u003cb\u003e{{count}}\u003c/b\u003e مشاركة إليه."}},"change_owner":{"title":"تغيير صاحب المشاركة","action":"تغيير العضوية ","error":"هناك خطأ في نغيير العضوية","label":"عضوية جديدة للمشاركات","placeholder":"اسم مستخدم للعضوية الجديدة","instructions":{"zero":"لم يتم تحديد أي مشاركة!","one":"الرجاء اختيار المالك الجديد لمشاركة نُشرت بواسطة \u003cb\u003e{{old_user}}\u003c/b\u003e.","two":"الرجاء اختيار المالك الجديد لمشاركتين نُشرت بواسطة \u003cb\u003e{{old_user}}\u003c/b\u003e.","few":"الرجاء اختيار المالك الجديد لـ {{count}} مشاركات نُشرت بواسطة \u003cb\u003e{{old_user}}\u003c/b\u003e.","many":"الرجاء اختيار المالك الجديد لـ {{count}} مشاركة نُشرت بواسطة \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"الرجاء اختيار المالك الجديد لـ {{count}} مشاركة نُشرت بواسطة \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"ملاحطة لن يتم نقل الاشعارت القديمة  للمشاركة  للمسخدم الجديد \u003cbr\u003eتحذير: اي بيانات تتعلق بالمشاركة هذه لن يتم نقلها للمستخدم الجديد. استعملها بحذر."},"change_timestamp":{"title":"تغيير الطابع الزمني","action":"تغيير الطابع الزمني","invalid_timestamp":"الطابع الزمني لا يمكن أن يكون في المستقبل.","error":"هناك خطأ في نغيير الطابع الزمني للموضوع.","instructions":"رجاء أختر الطابع الزمني الجديد للموضوع. المشاركات في الموضوع ستكون محدثة لنفس الوقت المختلف."},"multi_select":{"select":"تحديد","selected":"محدد ({{count}})","select_replies":"تحديد + ردود","delete":"حذف المحدد","cancel":"الغاء التحديد","select_all":"تحديد الكل","deselect_all":"حذف الكل","description":{"zero":"لم يتم اختيار أي مشاركة.","one":"اخترت مشاركة واحدة.","two":"اخترت مشاركتين.","few":"اخترت \u003cb\u003e{{count}}\u003c/b\u003e مشاراكات.","many":"اخترت \u003cb\u003e{{count}}\u003c/b\u003e مشاراكات.","other":"اخترت \u003cb\u003e{{count}}\u003c/b\u003e مشاركة."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"الاقتباس","edit":"تعديل {{link}} {{replyAvatar}} {{username}} .","edit_reason":"سبب:","post_number":"مشاركات {{number}}","last_edited_on":"آخر تعديل للمشاركة في ","reply_as_new_topic":"التعليق على الموضوع الاصلي","continue_discussion":"إكمال النقاش على {{postLink}}","follow_quote":"الذهاب إلى المشاركة المقتبسة","show_full":"عرض كامل المشاركة","show_hidden":"عرض المحتوى المخفي.","deleted_by_author":{"zero":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال أقل من ساعة مالم يُشار اليها)","one":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال ساعة مالم يُشار اليها)","two":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال ساعتين مالم يُشار اليها)","few":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال %{count} ساعات مالم يُشار اليها)","many":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال %{count} ساعة مالم يُشار اليها)","other":"(المشاركة سحبت بواسطة الكاتب, سوف تحذف تلقائياً خلال %{count} ساعة مالم يُشار اليها)"},"expand_collapse":"عرض/إخفاء","gap":{"zero":"لا يوجد ردود مخفية.","one":"مشاهدة رد مخفي.","two":"مشاهدة ردين مخفيين.","few":"مشاهدة  {{count}} ردود مخفية.","many":"مشاهدة  {{count}} رد مخفي.","other":"مشاهدة  {{count}} رد مخفي."},"more_links":"{{count}}  أكثر ..","unread":"المشاركة غير مقروءة","has_replies":{"zero":"لا ردود","one":"{{count}} رد","two":"ردان","few":"ردود قليلة","many":"ردود كثيرة","other":"{{count}} ردود."},"has_likes":{"zero":"لا إعجابات","one":"{{count}} إعجاب","two":"إعجابان","few":"إعجابات قليلة","many":"إعجابات كثيرة","other":"{{count}} إعجابات"},"has_likes_title":{"zero":"لم يعجب أحد بهذه المشاركة","one":"شخص واحد أعجب بهذه المشاركة","two":"أعجب شخصان بهذه المشاركة","few":"أعجب أشخاص قليلون بهذه المشاركة","many":"أعجب أشخاص كثيرون بهذه المشاركة","other":"{{count}} أشخاص أعجبوا بهذه المشاركة"},"has_likes_title_only_you":"أنت أعجبت بهذه المشاركة","has_likes_title_you":{"zero":"أنت أعجبت بهذه المشاركة","one":"أنت وشخص أخر أعجبتما بهذه المشاركة","two":"أنت وشخصان أخران أعجبتم بهذه المشاركة","few":"أنت و {{count}} أشخاص أخرون أعجبتم بهذه المشاركة .","many":"أنت و {{count}} شخصا أخرون أعجبتم بهذه المشاركة .","other":"أنت و {{count}} شخص أخرون أعجبتم بهذه المشاركة ."},"errors":{"create":"المعذرة، حدثت مشكلة أثناء إنشاء المشاركة. الرجاء المحاولة مرة أخرى.","edit":"المعذرة، حدث  خطأ أثناء تحرير مشاركتك. الرجاء المحاولة في وقت لاحق.","upload":"المعذرة، حدث خطأ أثناء رفع الملف. الرجاء المحاولة في وقت لاحق.","attachment_too_large":"نعتذر، الملف الذي تريد رفعه كبير جداَ ( الحد الاقصى {{max_size_kb}} كيلوبايت )","file_too_large":"المعذرة، الملف الذي تحاول رفعه أكبر من المسموح به {{max_size_kb}} كيلوبايت","too_many_uploads":"نأسف, يمكنك رفع ملف واحد فقط في نفس الوقت.","too_many_dragged_and_dropped_files":"يمكنك سحب و إفلات ١٠ ملفات في الوقت الواحد كحد أقصى.","upload_not_authorized":"المعذرة، الملف الذي تحاول رفعه غير مسموح به، الامتدادات المسموح بها هي {{authorized_extensions}}.","image_upload_not_allowed_for_new_user":"نعتذر، المستخدمين الجدد لا يمكنهم رفع صور.","attachment_upload_not_allowed_for_new_user":"نعتذر، المستخدمين الجدد لا يمكنهم رفع مرفقات.","attachment_download_requires_login":"يجب أن تكون مسجل الدخول لتنزيل المرفق."},"abandon":{"confirm":"هل أنت متأكد من فكرة تخليك عن مشاركتك؟","no_value":"لا ، حافظ عليها","yes_value":"نعم متأكد."},"via_email":"وصلت هذه المشاركة من خلال الإيميل","whisper":"هذه المشاركة همسة خاصة للمشرفين","wiki":{"about":"هذه المشاركة عبارة عن ويكي بمعنى أنها متاحة للمستخدمين العاديين لتحريرها ، "},"archetypes":{"save":"حفظ الخيارات"},"controls":{"reply":"كتابة رد على هذه المشاركة","like":"أعجبني","has_liked":"لقد تم تسجيل إعجابك بالمشاركة","undo_like":"التراجع عن الإعجاب بهذه المشاركة","edit":"تحرير المشاركة","edit_anonymous":"للأسف, يجب تسجيل الدخول للتعديل على المشاركة","flag":"قم بمتابعة هذا الموضوع بشكل خاص حيث سيصلك تنبيهات عليها ","delete":"حذف المشاركة","undelete":"التراجع عن حذف المشاركة","share":"مشاركة رابط في هذه المشاركة","more":"المزيد","delete_replies":{"confirm":{"zero":"ﻻ يوجد ردود لحذفها.","one":"هل تريد أيضاً حذف الرد المباشر لهذا الموضوع؟","two":"هل تريد أيضاً حذف الردين المباشرين لهذا الموضوع؟","few":"هل تريد أيضاً حذف {{count}} ردود مباشرة لهذه المشاركة؟","many":"هل تريد أيضاً حذف {{count}} رداً مباشراً لهذه المشاركة؟","other":"هل تريد أيضاً حذف {{count}} رداً مباشراً لهذه المشاركة؟"},"yes_value":"نعم، احذف هذه الردود أيضاً","no_value":"لا ، المشاركة فقط"},"admin":"عمليات المدير","wiki":"تحويلها إلى ويكي","unwiki":"إيقاف وضعية الويكي","convert_to_moderator":"إضافة لون للموظف","revert_to_regular":"حذف اللون الوظيفي","rebake":"إعادة بناء HTML","unhide":"إظهار","change_owner":"تغيير الملكية"},"actions":{"flag":"التبليغات","defer_flags":{"zero":"أجّل الإعلام","one":"أجّل الإعلام","two":"أجّل الإعلامات","few":"أجّل الإعلامات","many":"أجّل الإعلامات","other":"أجّل الإعلامات"},"it_too":{"off_topic":"أبلغ عنها أيضا","spam":"أبلغ عنها أيضا","inappropriate":"أبلغ عنها أيضا","custom_flag":"أبلغ عنها أيضا","bookmark":"أضفها للمفضلة","like":"أبدِ إعجابك بها :)","vote":"صوت لها أيضاً"},"undo":{"off_topic":"تراجع عن التبليغ","spam":"تراجع عن التبليغ","inappropriate":"تراجع عن التبليغ","bookmark":"التراجع عن التفضيل","like":"التراجع عن الإعجاب","vote":"التراجع عن التصويت"},"people":{"off_topic":"{{icons}} بلغ أن هذا لاعلاقة له بالموضوع","spam":"{{icons}} بلغ انه هذا هو سبام","spam_with_url":"{{icons}} بُلغ \u003ca href='{{postUrl}}'\u003eانه غير مرغوب به\u003c/a\u003e","inappropriate":"{{icons}} بلغ أنه غير لائق","notify_moderators":"{{icons}} تنبيه المشرف","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eنبه المشرف\u003c/a\u003e","notify_user":"{{icons}}  رسالة مُرسلة.","notify_user_with_url":"{{icons}} أرسلت \u003ca href='{{postUrl}}'\u003emessage\u003c/a\u003e .","bookmark":"{{icons}} اضف في المفضلة","like":"{{icons}} استحسان","vote":"{{icons}} صوت لهذا"},"by_you":{"off_topic":"لقد تم الإبلاغ عن الموضوع على أنه ليس في المكان الصحيح","spam":"تم الإبلاغ عن الموضوع على أنه سبام","inappropriate":"تم الإبلاغ عن الموضوع على أنه غير لائق","notify_moderators":"تم الإبلاغ عن الموضوع ليشاهده المشرف","notify_user":"لقد قمت بأرسال رسالة لهذا المستخدم","bookmark":"قمت بتفضيل هذه المشاركة","like":"قمت بإستحسان هذا","vote":"قمت بالتصويت لهذه المشاركة"},"by_you_and_others":{"off_topic":{"zero":"أنت بلّغت بأن هذا خارج عن الموضوع.","one":"أنت وآخر بلّغتما بأن هذا خارج عن الموضوع.","two":"أنت و {{count}} آخرون بلّغتم بأن هذا خارج عن الموضوع.","few":"أنت و {{count}} آخرون بلّغتم بأن هذا خارج عن الموضوع.","many":"أنت و {{count}} آخرون بلّغتم بأن هذا خارج عن الموضوع.","other":"أنت و {{count}} آخرون بلّغتم بأن هذا خارج عن الموضوع."},"spam":{"zero":"أنت أبلّغت بأن هذا غير مرغوب فيه.","one":"أنت وآخر أبلّغتما بأن هذا غير مرغوب فيه.","two":"أنت و {{count}} آخرون أبلّغتم بأن هذا غير مرغوب فيه.","few":"أنت و {{count}} آخرون أبلّغتم بأن هذا غير مرغوب فيه.","many":"أنت و {{count}} آخرون أبلّغتم بأن هذا غير مرغوب فيه.","other":"أنت و {{count}} آخرون أبلّغتم بأن هذا غير مرغوب فيه."},"inappropriate":{"zero":"أنت أشرت لهذا كغير ملائم.","one":"أنت و شخص آخر أشرتُما لهذا كغير ملائم.","two":"أنت و {{count}} آخران أشرتُم لهذا كغير ملائم.","few":"أنت و {{count}} آخرون أشرتُم لهذا كغير ملائم.","many":"أنت و {{count}} آخرون أشرتُم لهذا كغير ملائم.","other":"أنت و {{count}} آخرون أشرتُم لهذا كغير ملائم."},"notify_moderators":{"zero":"أنت و 1 آخر علّمتم هذا للمراقبين","one":"أنت و 1 آخر علّمتم هذا للمراقبين","two":"أنت و {{count}} آخرون علّمتما هذا للمراقبين","few":"أنت و {{count}} آخرون علّمتم هذا للمراقبين","many":"أنت و {{count}} آخرون علّمتم هذا للمراقبين","other":"أنت و {{count}} آخرون علّمتم هذا للمراقبين"},"notify_user":{"zero":"أنت أرسلت رسالة لهذا المستخدم.","one":"أنت و شخص آخر أرسلتما رسالة لهذا المستخدم.","two":"أنت و {{count}} آخران أرسلتم رسالة لهذا المستخدم.","few":"أنت و {{count}} آخرون أرسلتم رسالة لهذا المستخدم.","many":"أنت و {{count}} آخرون أرسلتم رسالة لهذا المستخدم.","other":"أنت و {{count}} آخرون أرسلتم رسالة لهذا المستخدم."},"bookmark":{"zero":"أنت عَلَّمتَ هذه المشاركة.","one":"أنت و شخص آخر عَلَّمتُما هذه المشاركة.","two":"أنت و {{count}} آخران عَلَّمتُم هذه المشاركة.","few":"أنت و {{count}} آخرون عَلَّمتُم هذه المشاركة.","many":"أنت و {{count}} آخرون عَلَّمتُم هذه المشاركة.","other":"أنت و {{count}} آخرون عَلَّمتُم هذه المشاركة."},"like":{"zero":"أنت فقط أعجبت بهذا .","one":"أنت و {{شخص}} أخر أعجبتما بهذا .","two":"أنت و {{شخصان}}  أخران أعجبتوا بهذا .","few":"أنت و أشخاص {{قليلة}} أخرى أعجبتوا بهذا .","many":"أنت و أشخاص {{كثيرة}} أخرى أعجبتوا بهذا .","other":"أنت و {{count}} أشخاص أخرون أعجبتوا بهذا ."},"vote":{"zero":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع","one":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع","two":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع","few":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع","many":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع","other":"أنت و {{count}} أشخاص أخرين صوتو لهذا الموضوع"}},"by_others":{"off_topic":{"zero":"لم يتم الاشارة لهذا كخارج عن الموضوع.","one":"شخص أشار لهذا كخارج عن الموضوع.","two":"شخصان أشارا لهذا كخارج عن الموضوع.","few":"{{count}} أشخاص أشاروا لهذا كخارج عن الموضوع.","many":"{{count}} شخص أشار لهذا كخارج عن الموضوع.","other":"{{count}} شخص أشار لهذا كخارج عن الموضوع."},"spam":{"zero":"لم يتم الاشارة لهذا كغير مفيد,","one":"شخص أشار لهذا كغير مفيد.","two":"شخصان أشارا لهذا كغير مفيد.","few":"{{count}} أشخاص أشاروا لهذا كغير مفيد.","many":"{{count}} شخص أشار لهذا كغير مفيد.","other":"{{count}} شخص أشار لهذا كغير مفيد."},"inappropriate":{"zero":"لم تتم الإشارة لهذا كغير ملائم.","one":"شخص أشار لهذا كغير ملائم.","two":"شخصان أشارا لهذا كغير ملائم.","few":"{{count}} أشخاص أشاروا لهذا كغير ملائم.","many":"{{count}} شخص أشاروا لهذا كغير ملائم.","other":"{{count}} شخص أشاروا لهذا كغير ملائم."},"notify_moderators":{"zero":"1 عضو علّم هذا للمراقبين","one":"1 عضو علّم هذا للمراقبين","two":"{{count}} أعضاء علّمو هذا للمراقبين","few":"{{count}} أعضاء علّمو هذا للمراقبين","many":"{{count}} أعضاء علّمو هذا للمراقبين","other":"{{count}} أعضاء علّمو هذا للمراقبين"},"notify_user":{"zero":"لم يتم إرسال رسالة لهذا المستخدم.","one":"شخص أرسل رسالة لهذا المستخدم.","two":"{{count}} أرسلا رسالة لهذا المستخدم.","few":"{{count}} أرسلوا رسالة لهذا المستخدم.","many":"{{count}} أرسلوا رسالة لهذا المستخدم.","other":"{{count}} أرسلوا رسالة لهذا المستخدم."},"bookmark":{"zero":"لم يفضل أحد هذه المشاركة.","one":" شخص واحد فضل هذه المشاركة.","two":" شخصان فضلا هذه المشاركة.","few":"أشخاص قليلون فضلوا هذه المشاركة.","many":"أشخاص كثيرون فضلوا هذه المشاركة.","other":"{{count}} أشخاص فضلوا هذه المشاركة."},"like":{"zero":"شخص واحد اعجب بهذا","one":"{{count}} أشخاص أعجبو بهذا","two":"{{count}} أشخاص أعجبو بهذا","few":"{{count}} أشخاص أعجبو بهذا","many":"{{count}} أشخاص أعجبو بهذا","other":"{{count}} أشخاص أعجبو بهذا"},"vote":{"zero":"لم يتم التصويت لهذه المشاركة.","one":"شخص صوت لهذه المشاركة.","two":"شخصان صوتا لهذه المشاركة.","few":"{{count}} أشخاص صوتوا لهذه المشاركة.","many":"{{count}} شخص صوتوا لهذه المشاركة.","other":"{{count}} شخص صوتوا لهذه المشاركة."}}},"delete":{"confirm":{"zero":"هل أنت متأكد أنك لا تريد حذف تلك المشاركة؟","one":"هل أنت متأكد أنك تريد حذف تلك المشاركة؟","two":"هل أنت متأكد أنك تريد حذف تلك المشاركتين؟","few":"هل أنت متأكد أنك تريد حذف تلك المشاركات القليلة؟","many":"هل أنت متأكد أنك تريد حذف تلك المشاركات الكثيرة؟","other":"هل أنت متأكد أنك تريد حذف كل تلك المشاركات؟"}},"revisions":{"controls":{"first":"التعديل الاول","previous":"التعديل السابق","next":"التعديل التالي","last":"آخر تعديل","hide":"اخفاء التعديل","show":"اظهار التعديل","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Show the rendered output with additions and removals inline","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"اظهار نتيجة المخرجات جنب الى جنب","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"اظهار الفروقات في الصف المصدري جنبا الى جنب","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e صف"}}}},"category":{"can":"can\u0026hellip;","none":"(غير مصنف)","all":"جميع التصنيفات","choose":"اختيار category\u0026hellip;","edit":"تعديل","edit_long":"تعديل","view":"اظهار المواضيع في الصنف","general":"عام","settings":"اعدادات","topic_template":"إطار الموضوع","delete":"حذف الصنف","create":"قسم جديد","create_long":"أنشئ فئة جديدة","save":"حفظ القسم","slug":"عنوان التصنيف/Slug","slug_placeholder":"(اختياري) خط تحت عنوان الموقع","creation_error":"حدثت مشكلة اثناء انشاء القسم","save_error":"حدث خطأ أثناء حفظ التصنيف","name":"اسم التصنيف","description":"الوصف","topic":"موضوع التصنيف","logo":"شعار التصنيف","background_image":"خلفية التصنيف","badge_colors":"ألوان الشارة","background_color":"لون الخلفية","foreground_color":"لون الخط","name_placeholder":"كلمة أو كلمتين على الأكثر","color_placeholder":"أي لون ","delete_confirm":"هل أنت متأكد من رغبتك في حذف هذا التصنيف؟","delete_error":"حدث خطأ أثناء حذف التصنيف","list":"عرض التصنيفات","no_description":"الرجاء إضافة وصف لهذا التصنيف.","change_in_category_topic":"تعديل الوصف","already_used":"هذا اللون تم استخدامه سابقا في تصنيف آخر","security":"الأمن","special_warning":"تحذير: هذه الفئة هي فئة قبل التصنيف وإعدادات الحماية لا يمكن تعديلها. إذا لم تكن تريد استخدام هذه الفئة، احذفها بدلا من تطويعها لأغراض أخرى.","images":"الصور","auto_close_label":"الإغلاق التلقائي للمواضيع بعد:","auto_close_units":"ساعات","email_in":"تعيين بريد إلكتروني خاص:","email_in_allow_strangers":"قبول بريد إلكتروني من مستخدمين لا يملكون حسابات","email_in_disabled":"إضافة مواضيع جديدة من خلال البريد الإلكتروني موقف في الوقت الحالي من خلال إعدادات الموقع. لتفعيل إضافة مواضيع جديدة من خلال البريد الإلكتروني,","email_in_disabled_click":"قم بتفعيل خيار \"email in\" في الإعدادات","contains_messages":"غير هذه الفئة لتحوي الرسائل فقط.","suppress_from_homepage":"كتم هذه الفئة من الصفحة الرئيسية","allow_badges_label":"السماح بالحصول على الأوسمة في هذا التصنيف","edit_permissions":"تعديل الصلاحيات","add_permission":"اضف صلاحية","this_year":"هذه السنة","position":"المكان","default_position":"المكان الافتراضي","position_disabled":"التصنيفات يتم عرضها حسب النشاط. لتغيير طريقة ترتيب التصنيفات، ","position_disabled_click":"فعّل خيار \" تثبيت مكان التصنيفات\".","parent":"التصنيف الأب","notifications":{"watching":{"title":"مشاهده ","description":"ستتم مراقبة جميع المواضيع الجديدة في هذه التصانيف. سيتم اشعارك بجميع المشاركات الجديدة في كل المواضيع، بالاضافة الى عدد الردود الجديدة الذي سيظهر بجانب الموضوع."},"tracking":{"title":"تتبع ","description":"ستتم متابعة جميع المواضيع الجديدة في هذه التصانيف. سيتم اشعارك اذا ذكر احدهم @اسمك او رد عليك، كذلك عدد المشاركات الجديدة سيظهر بجانب الموضوع."},"regular":{"title":"منتظم","description":"سوف تُنبه اذا قام أحد بالاشارة لاسمك \"@name\" أو الرد عليك."},"muted":{"title":"كتم","description":"لن يتم إشعارك بأي مشاركات جديدة في هذه التصنيفات ولن يتم عرضها في قائمة المواضيع المنشورة مؤخراً."}}},"flagging":{"title":"شكرا لمساعدتك في إبقاء مجتمعنا نظيفاً.","private_reminder":"التبليغات ذات خصوصية، تظهر \u003cb\u003e فقط \u003c/b\u003e للمشرفين","action":"التبليغ عن مشاركة","take_action":"أجراء العمليه ","notify_action":"رسالة","delete_spammer":"حذف مرسلي البريد المزعج","delete_confirm":"أنت على وشك حذف  \u003cb\u003e%{posts}\u003c/b\u003e المشاركات و\u003cb\u003e%{topics}\u003c/b\u003e المواضيع من هذا المستخدم , حذف حساباتهم منهم من التسجيل وحجب الاي بي  \u003cb\u003e%{ip_address}\u003c/b\u003e, واضافة بريدهم الالكتروني  \u003cb\u003e%{email}\u003c/b\u003e لقائمة المحجوبين  . هل أنت متأكد أن هذا المستخدم سبام ?","yes_delete_spammer":"نعم , حذف مرسلي البريد المزعج","ip_address_missing":"(N/A)","hidden_email_address":"(مخفي)","submit_tooltip":"إرسال تبليغ","take_action_tooltip":"الوصول إلى الحد الأعلى للتبليغات دون انتظار تبليغات أكثر من أعضاء الموقع.","cant":"المعذرة، لا يمكنك التبليغ عن هذه المشاركة في هذه اللحظة.","notify_staff":"طاقم التبليغ ","formatted_name":{"off_topic":"خارج عن الموضوع","inappropriate":"غير لائق","spam":"هذا سبام"},"custom_placeholder_notify_user":"كن محدد, استدلالي ودائما حسن الاخلاق","custom_placeholder_notify_moderators":"ممكن تزودنا بمعلومات أكثر عن سبب عدم ارتياحك حول هذه المشاركة؟ زودنا ببعض الروابط و الأمثلة قدر الإمكان.","custom_message":{"at_least":"ادخل على الاقل  {{n}} حرف","more":"{{n}} الذهاب الى","left":"{{n}} باقي"}},"flagging_topic":{"title":"شكرا لمساعدتنا في ابقاء مجتمعنا نضيفا","action":"التبليغ عن الموضوع","notify_action":"رسالة"},"topic_map":{"title":"ملخص الموضوع","participants_title":"مشاركين معتادين","links_title":"روابط شائعة.","links_shown":"اظهار  {{totalLinks}} روابط...","clicks":{"zero":"%{count} نقرة","one":"%{count} نقرة","two":"%{count} نقرتان","few":"%{count} نقرات","many":"%{count} نقرات","other":"%{count} نقرات"}},"topic_statuses":{"warning":{"help":"هذا تحذير رسمي"},"bookmarked":{"help":"قمت بتفضيل  هذا الموضوع"},"locked":{"help":"هذا الموضوع مغلق, لن يتم قبول اي رد "},"archived":{"help":"هذا الموضوع مؤرشف,لن تستطيع أن تعدل عليه"},"locked_and_archived":{"help":"هذا الموضوع مغلق و مؤرشف; لم يعد يقبل ردود جديدة أو لا يمكن تغيره."},"unpinned":{"title":"غير مثبت","help":"هذا الموضوع غير مثبت بالنسبة لك, سيتم عرضه بالترتيب العادي"},"pinned_globally":{"title":"تثبيت عام","help":"هذا الموضوع مثبت بشكل عام, سوف يظهر في مقدمة المواضيع بآخر المشاركات وفي الفئة الخاصة به"},"pinned":{"title":"مثبت","help":"هذا الموضوع مثبت لك, سوف يتم عرضه في اول القسم"},"invisible":{"help":"هذا الموضوع غير مصنف لن يظهر في قائمة التصانيف ولايمكن الدخول عليه الابرابط مباشر."}},"posts":"مشاركات","posts_lowercase":"مشاركات","posts_long":"هناك {{number}} مشاركات في هذا الموضوع","original_post":"المشاركة الاصلية","views":"مشاهدات","views_lowercase":{"zero":"مشاهده","one":"مشاهد","two":"مشاهد","few":"مشاهدات","many":"مشاهدات","other":"مشاهدات"},"replies":"ردود ","views_long":"هذا الموضوع قد تمت مشاهدته  {{number}} مرات","activity":"النشاط","likes":"اعجابات","likes_lowercase":{"zero":"أعجاب","one":"أعجاب","two":"اﻹعجابات","few":"اﻹعجابات","many":"اﻹعجابات","other":"اﻹعجابات"},"likes_long":"هناك {{number}} اعجابات في هذا الموضوع","users":"مستخدمين","users_lowercase":{"zero":"مستخدم","one":"مستخدم","two":"مستخدم","few":"مستخدمون","many":"مستخدمون","other":"مستخدمون"},"category_title":"قسم","history":"تاريخ","changed_by":"الكاتب {{author}}","raw_email":{"title":"البريد الإلكتروني","not_available":"غير متوفر"},"categories_list":"قائمة الاقسام","filters":{"with_topics":"%{filter} مواضيع","with_category":"%{filter} %{category} مواضيع","latest":{"title":"اخر المواضيع","title_with_count":{"zero":"اخر المواضيع (1)","one":"اخر المواضيع (1)","two":"الآخر ({{count}})","few":"الآخر ({{count}})","many":"الآخر ({{count}})","other":"الآخر ({{count}})"},"help":"مواضيع بآخر المشاركات"},"hot":{"title":"ساخن","help":"مختارات من مواضيع ساخنة"},"read":{"title":"قراءة","help":"مواضيع قمت بقراءتها بترتيب آخر قراءة"},"search":{"title":"بحث","help":"بحث في كل المواضيع"},"categories":{"title":"اقسام","title_in":"قسم - {{categoryName}}","help":"جميع المواضيع تتبع القسم"},"unread":{"title":"غير مقروء","title_with_count":{"zero":"غير مقروء (1)","one":"غيرمقروء( 1)","two":"غير مقروء ({{count}})","few":"غير مقروء {({count}})","many":"غير مقروء ({{count}})","other":"غير مقروء ({{count}})"},"help":"مواضيع أنت تشاهدها بمشاركات غير مقروءة ","lower_title_with_count":{"zero":"1 غير مقررء ","one":"1 غير مقروء","two":"{{count}} غير مقروء ","few":"{{count}} غير مقروء ","many":"{{count}} غير مقروء","other":"{{count}} غير مقروء"}},"new":{"lower_title_with_count":{"zero":"لا جديد","one":"1 جديد","two":"{{count}} جديد","few":"{{count}} جديد","many":"{{count}} جديد","other":"{{count}} جديد"},"lower_title":"جديد","title":"جديد","title_with_count":{"zero":"لا جديد","one":"جديد (1)","two":"جديد ({{count}})","few":"جديد ({{count}})","many":"جديد ({{count}})","other":"جديد ({{count}})"},"help":"مواضيع جديد في الايام السابقة"},"posted":{"title":"مشاركاتي","help":"مواضيع شاركت بها "},"bookmarks":{"title":"المفضلة","help":"مواضيع قمت بتفضيلها"},"category":{"title":"{{categoryName}}","title_with_count":{"zero":"{{categoryName}} (1)","one":"{{categoryName}} (1)","two":"{{categoryName}} ({{count}})","few":"{{categoryName}} ({{count}})","many":"{{categoryName}} ({{count}})","other":"{{categoryName}} ({{count}})"},"help":"آخر المواضيع في  {{categoryName}} قسم"},"top":{"title":"أعلى","help":"أكثر المواضيع نشاطا خلال سنة, شهر, اسبوع او يوم","all":{"title":"كل الأوقات"},"yearly":{"title":"سنوي"},"quarterly":{"title":"فصليا"},"monthly":{"title":"شهري"},"weekly":{"title":"اسبوعي"},"daily":{"title":"يومي"},"all_time":"جميع الأوقات","this_year":"سنة","this_quarter":"ربع","this_month":"شهر","this_week":"أسبوع","today":"اليوم","other_periods":"مشاهدة الأفضل"}},"browser_update":"للأسف, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eمتصفحك قديم لكي يفتح هذه الصفحة\u003c/a\u003e. Please \u003ca href=\"http://browsehappy.com\"\u003eقم بتحديث متصفحك\u003c/a\u003e.","permission_types":{"full":"انشاء / رد / مشاهدة","create_post":"رد / مشاهدة","readonly":"مشاهدة"},"poll":{"voters":{"zero":"لا يوجد مصوتون.","one":"مصوت.","two":"مصوتان.","few":"مصوتون قليلون.","many":"مصوتون كثيرون.","other":"مصوتون"},"total_votes":{"zero":"مجموع عدم التصويت.","one":"مجموع التصويت.","two":"مجموع التصويتان.","few":"مجموع الأصوات القليلة.","many":"مجموع الأصوات الكثيرة.","other":"مجموع الأصوات."},"average_rating":"متوسط التصنيف: \u003cstrong\u003e%{average}\u003c/strong\u003e ","multiple":{"help":{"at_least_min_options":{"zero":"لا يجب عليك اختيار أي خيار.","one":"يجب عليك أن تختار خيار \u003cstrong\u003e واحد \u003c/strong\u003e على الأقل.","two":"يجب عليك أن تختار  \u003cstrong\u003e خياران \u003c/strong\u003e على الأقل.","few":"يجب عليك أن تختار \u003cstrong\u003e %{count} \u003c/strong\u003e بعض الخيارات على الأقل.","many":"يجب عليك أن تختار \u003cstrong\u003e %{count} \u003c/strong\u003e عدة خيارات على الأقل.","other":"يجب عليك الاختيار على الأقل."},"up_to_max_options":{"zero":"لا يمكنك اختيار أي خيار.","one":"يمكنك إختيار مايصل إلى خيار \u003cstrong\u003e واحد \u003c/strong\u003eفقط.","two":"يمكنك إختيار مايصل إلى \u003cstrong\u003eخياران\u003c/strong\u003eفقط.","few":"يمكنك إختيار بعض \u003cstrong\u003e %{count} \u003c/strong\u003e الخيارات .","many":"يمكنك إختيار عدة \u003cstrong\u003e %{count} \u003c/strong\u003e خيارات .","other":"يمكنك اختيار حتى \u003cstrong\u003e%{count}\u003c/strong\u003e خيارات."},"x_options":{"zero":"لا يجب عليك إختيار أي خيار.","one":"يجب عليك إختيار خيار\u003cstrong\u003eواحد\u003c/strong فقط.","two":"يجب عليك إختيار \u003cstrong\u003eخياران\u003c/strong\u003e فقط.","few":"يجب عليك إختيار \u003cstrong\u003e %{count} \u003c/strong\u003e بعض الخيارات.","many":"يجب عليك إختيار \u003cstrong\u003e %{count} \u003c/strong\u003e عدة خيارات.","other":"يجب عليك إختيار \u003cstrong\u003e %{count} \u003c/strong\u003e خيارات."},"between_min_and_max_options":"يجب عليك إختيار بين  \u003cstrong\u003e%{min}\u003c/strong\u003e و \u003cstrong\u003e%{max}\u003c/strong\u003e خيارات ."}},"cast-votes":{"title":"إدراج صوتك.","label":"صوت اﻵن!"},"show-results":{"title":"عرض نتائج التصويت.","label":"عرض النتائج."},"hide-results":{"title":"العودة إلى أصواتك.","label":"إخفاء النتائج."},"open":{"title":"فتح التصويت.","label":"فتح.","confirm":"هل أنت متأكد من فتح هذا التصويت؟"},"close":{"title":"إغلاق التصويت.","label":"إغلاق.","confirm":"هل أنت متأكد من إغلاق هذا التصويت؟"},"error_while_toggling_status":"حدث خطأ عند محاولتك لتبديل حالة التصويت.","error_while_casting_votes":"حدث خطأ عند محاولة إدراج صوتك."},"type_to_filter":"اكتب لتصفية","admin":{"title":"مدير المجتمع","moderator":"مراقب","dashboard":{"title":"داشبورد","last_updated":"أخر تحديث للوحة التحكم:","version":"الاصدار","up_to_date":"لديك آخر اصدار!","critical_available":"يوجد تحديث هام.","updates_available":"يوجد تحديثات.","please_upgrade":"يرجى الترقية!","no_check_performed":"لم يتم التحقق من التحديثات. اضمن أن sidekiq يعمل.","stale_data":"لم يتم التحقق من التحديثات مؤخراً. اضمن أن sidekiq يعمل.","version_check_pending":"يبدو أنك رُقيت مؤخرا. رائع!","installed_version":"مثبّت","latest_version":"آخر","problems_found":"يوجد بعض المشاكل عند تثبيت Discourse :","last_checked":"آخر فحص","refresh_problems":"تحديث","no_problems":"لم يتم العثور على اي مشاكل.","moderators":"مراقبين:","admins":"مدراء:","blocked":"محظور:","suspended":"موقوف:","private_messages_short":"الرسائل","private_messages_title":"الرسائل","mobile_title":"متنقل","space_free":"{{size}} إضافي","uploads":"عمليات الرفع","backups":"النسخ الاحتياطية","traffic_short":"المرور","traffic":"طلبات تطبيقات الويب","page_views":"طلبات API ","page_views_short":"طلبات API ","show_traffic_report":"عرض تقرير مرور مفصل","reports":{"today":"اليوم","yesterday":"امس","last_7_days":"اخر ٧ ايام ","last_30_days":"اخر ٣٠ يوم","all_time":"كل الوقت","7_days_ago":"منذ ٧ ايام","30_days_ago":"منذ ٣٠ يوم","all":"الكل","view_table":"جدول","view_chart":"شريط الرسم البياني","refresh_report":"تحديث التقرير ","start_date":"تاريخ البدء","end_date":"تاريخ الإنتهاء"}},"commits":{"latest_changes":"آخر تغيير: يرجى التحديث","by":"بواسطة"},"flags":{"title":"التبليغات","old":"قديم","active":"نشط","agree":"أوافق","agree_title":"أكد هذا البلاغ لكونه صحيح وصالح","agree_flag_modal_title":"أوافق مع ...","agree_flag_hide_post":"اوافق (اخفاء المشاركة + ارسال ر.خ)","agree_flag_hide_post_title":"أخفي هذه المشاركة وَ تلقائيا بإرسال رسالة للمستخدم وحثهم على تحريرها","agree_flag_restore_post":"موافق (استعادة المشاركة)","agree_flag_restore_post_title":"استعد هذه المشاركة.","agree_flag":"الموافقه على التبليغ","agree_flag_title":"الموافقة مع التَعَلّيم وحفظ المشاركة دون تغيير.","defer_flag":"تأجيل","defer_flag_title":"إزالة البلاغ، لا يتطلب منك إجراء في الوقت الحالي.","delete":"حذف","delete_title":"حذف المشاركة المرتبطة بهذا البلاغ","delete_post_defer_flag":"حذف المشاركة مع تأجيل البلاغ","delete_post_defer_flag_title":"حذف المشاركة. اذا كانت المشاركة الاولى, احذف الموضوع","delete_post_agree_flag":"حذف المشاركة مع الموافقة على البلاغ","delete_post_agree_flag_title":"حذف المشاركة. اذا كانت المشاركة الاولى, احذف الموضوع","delete_flag_modal_title":"حذف مع ...","delete_spammer":"حذف مرسلي البريد المزعج","delete_spammer_title":"احذف المستخدم مع مشاركاته و مواضيعه.","disagree_flag_unhide_post":"أختلف مع البلاغ، إعادة إظهار المشاركة.","disagree_flag_unhide_post_title":"حذف أي بلاغ يخص هذه المشاركة مع إظهارها مرة أخرى","disagree_flag":"أختلف","disagree_flag_title":"رفض هذا البلاغ لكونه خاطئ","clear_topic_flags":"إتمام العملية","clear_topic_flags_title":"تم فحص الموضوع وحل المشاكل المتعلقة به. إضغط على إتمام العملية لحذف هذه البلاغات.","more":"ردود أكثر...","dispositions":{"agreed":"متفق","disagreed":"أختلف","deferred":"مؤجل"},"flagged_by":"مُبلّغ عنه بواسطة","resolved_by":"تم حلّه بواسطة","took_action":"اجريت العمليات","system":"النظام","error":"حدث خطأ ما","reply_message":"الرد","no_results":"لا يوجد بلاغات.","topic_flagged":"هذا  \u003cstrong\u003eالموضوع\u003c/strong\u003e قد عُلِّم.","visit_topic":"زيارة الموضوع لاتخاذ قرار","was_edited":"تم تعديل المشاركة بعد أول بلاغ","previous_flags_count":"هذه المشاركة قد سبق الإشارة إليها {{count}} مرات.","summary":{"action_type_3":{"zero":"خارج عن الموضوع","one":"خارج عن الموضوع","two":"خارج عن الموضوع x{{count}}","few":"خارج عن الموضوع x{{count}}","many":"خارج عن الموضوع x{{count}}","other":"خارج عن الموضوع x{{count}}"},"action_type_4":{"zero":"غير ملائم","one":"غير ملائم","two":"غير ملائم x{{count}}","few":"غير ملائم x{{count}}","many":"غير ملائم x{{count}}","other":"غير ملائم x{{count}}"},"action_type_6":{"zero":"مخصص","one":"مخصص","two":"مخصص x{{count}}","few":"مخصص x{{count}}","many":"مخصص x{{count}}","other":"مخصص x{{count}}"},"action_type_7":{"zero":"مخصص","one":"مخصص","two":"مخصص x{{count}}","few":"مخصص x{{count}}","many":"مخصص x{{count}}","other":"مخصص x{{count}}"},"action_type_8":{"zero":"رسائل مزعجة","one":"رسائل مزعجة","two":"رسائل مزعجة x{{count}}","few":"رسائل مزعجة x{{count}}","many":"رسائل مزعجة x{{count}}","other":"رسائل مزعجة x{{count}}"}}},"groups":{"primary":"المجموعة الأساسية","no_primary":"(لايوجد مجموعة أساسية)","title":"مجموعات","edit":"تعديل المجموعة","refresh":"تحديث","new":"جديد","selector_placeholder":"أدخل اسم المستخدم","name_placeholder":"اسم المجموعة, بدون مسافة, مثل قاعدة اسم المستخدم","about":"هنا عدّل على عضوية المجموعة والاسماء","group_members":"اعضاء المجموعة","delete":"حذف","delete_confirm":"حذف هذة المجموعة؟","delete_failed":"لا يمكن حذف هذه المجموعة. اذا كانت هذة المجموعة مجموعة تلقائية, لا يمكن حذفها.","delete_member_confirm":"ازالة '%{username}' من  '%{group}' المجموعة?","delete_owner_confirm":"هل تريد إزالة صلاحيات الإدارة من '%{username} ؟","name":"الاسم","add":"اضافة","add_members":"اضافة عضو","custom":"مخصص","bulk_complete":"تم اضافة المستخدم/المستخدمين الى المجموعة","bulk":"اضافة زمرة الى مجموعة","bulk_paste":"اكتب قائمة من اسماء المستخدمين او البريد الالكتروني ، واحد في كل سطر :","bulk_select":"(اختر مجموعة)","automatic":"تلقائي","automatic_membership_email_domains":"المستخدمين الذين يمتلكون بريد الالكتروني عنوانه مطابق للعنوان الذي في القائمة سيتم تلقائيا اضافتهم للمجموعة.","automatic_membership_retroactive":"اضافة الاعضاء الذين يمتكلون عنوان ايميل مطابق للعنوان الموجود في القائمة.","default_title":"عنوان افتراضي لكل أعضاء هذه المجموعة.","primary_group":"تلقيائاً ضعها كمجموعة أساسية.","group_owners":"الملّاك","add_owners":"اضف ملّاكً"},"api":{"generate_master":"Generate Master API Key","none":"There are no active API keys right now","user":"مستخدمين","title":"API","key":"API Key","generate":"إنشاء","regenerate":"إعادة إنشاء","revoke":"Revoke","confirm_regen":"هل أنت متأكد من استبدال مفتاح الAPI بالمفتاح الجديد ؟","confirm_revoke":"هل أنت متأكد من رغبتك في تعطيل هذا المفتاح؟","info_html":"Your API key will allow you to create and update topics using JSON calls.","all_users":"جميع المستخدمين","note_html":"حافظ على \u003cstrong\u003eسرية\u003c/strong\u003e هذا المفتاح، اي شخص يحصل عليه يستطيع انشاء مواضيع باسم اي مستخدم اخر"},"plugins":{"title":"اضافات","installed":"اضافات مثيته","name":"الاسم","none_installed":"لاتملك اي اضافة مثبته","version":"الاصدار","enabled":"مفعل؟","is_enabled":"Y","not_enabled":"N","change_settings":"تغيير الاعدادت","change_settings_short":"الاعدادات","howto":"كيف اثبت اضافة؟"},"backups":{"title":"نسخة احتياطية","menu":{"backups":"نسخة احتياطية","logs":"Logs"},"none":"لاتوجد نسخ احتياطية","read_only":{"enable":{"title":"تفعيل وضع القراءة فقط","label":"تفعيل وضع القراءة فقط.","confirm":"هل أنت متأكد من تفعيل وضع القراءة فقط؟"},"disable":{"title":"تعطيل وضع القراءة فقط","label":"تعطيل وضع القراءة فقط."}},"logs":{"none":"No logs yet."},"columns":{"filename":"اسم الملف","size":"حجم"},"upload":{"label":"رفع","title":"رفع نسخة احتياطية لهذه الحالة.","uploading":"يتم الرفع...","success":"'{{filename}}' تم رفعه بنجاح.","error":"هناك مشكلة في رفع  '{{filename}}': {{message}}"},"operations":{"is_running":"هناك عملية مازالت تعمل ...","failed":"الـ {{operation}} فشلت. الرجاء التحقق من logs.","cancel":{"label":"إلغاء","title":"الغاء العملية الحالية","confirm":"هل أنت متأكد من رغبتك في الغاء العملية الحالية ؟"},"backup":{"label":"نسخة احتياطية","title":"انشاء نسخة احتياطية","confirm":"هل تريد انشاء نسخة احتياطية جديدة ؟","without_uploads":"نعم (لا تضمن الملفات)"},"download":{"label":"تحميل","title":"تحميل النسخة الاحتياطية"},"destroy":{"title":"حذف النسخة الاحتياطية","confirm":"هل أنت متأكد من رغبتك في حذف النسخة الاحتياطية؟"},"restore":{"is_disabled":"Restore is disabled in the site settings.","label":"استعادة","title":"اعادة تخزين النسخة الاحتياطية","confirm":"هل أنت متأكد من رغبتك في اعادة تخزين النسخة الاحتياطية؟"},"rollback":{"label":"اعادة السنخة السابقة","title":"Rollback the database to previous working state","confirm":"Are your sure you want to rollback the database to the previous working state?"}}},"export_csv":{"user_archive_confirm":"هل أنت متأكد من رغبتك في تحميل جميع مشاركاتك ؟","success":"بدأ التصدير, سيتم إعلامك برسالة عند اكتمال العملية.","failed":"فشل في التصدير, الرجاء التحقق من الـ logs","rate_limit_error":"المشاركات يمكن تحميلها لمرة واحدة في اليوم , الرجاء المحاولة غدا.","button_text":"التصدير","button_title":{"user":"تصدير قائمة المستخدمين على شكل CSV","staff_action":"تصدير قائمة الموظفين على شكل CSV.","screened_email":"Export full screened email list in CSV format.","screened_ip":"Export full screened IP list in CSV format.","screened_url":"Export full screened URL list in CSV format."}},"export_json":{"button_text":"تصدير"},"invite":{"button_text":"ارسال دعوات","button_title":"ارسال دعوات"},"customize":{"title":"تخصيص","long_title":"تخصيص الموقع","css":"CSS","header":"Header","top":"Top","footer":"تذييل ","embedded_css":"تضمين CSS","head_tag":{"text":"\u003c/head\u003e","title":"HTML that will be inserted before the \u003c/head\u003e tag"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML that will be inserted before the \u003c/body\u003e tag"},"override_default":"Do not include standard style sheet","enabled":"مفعل؟","preview":"معاينة","undo_preview":"ازالة المعاينة","rescue_preview":"الشكل الافتراضي","explain_preview":"مشاهدة الموقع بهذا الشكل المخصص","explain_undo_preview":"الرجوع الى الشكل السابق","explain_rescue_preview":"مشاهدة الموقع بالشكل الافتراضي","save":"حفظ","new":"جديد","new_style":"تصميم جديد","import":"استيراد","import_title":"حدد ملف او انسخ نص","delete":"حذف","delete_confirm":"حذف هذا التخصيص؟","about":"Modify CSS stylesheets and HTML headers on the site. Add a customization to start.","color":"Color","opacity":"Opacity","copy":"نسخ","email_templates":{"title":"قالب البريد الالكتروني ","subject":"الموضوع","body":"المحتوى","none_selected":"اختر قالب بريد الكتروني لتبدا بتعديله ","revert":"اعاده التغيرات ","revert_confirm":"هل انت متاكد من انك تريد اعاده التغيرات؟ "},"css_html":{"title":"CSS/HTML","long_title":"CSS and HTML Customizations"},"colors":{"title":"اللون","long_title":"نمط الألوان","about":"Modify the colors used on the site without writing CSS. Add a scheme to start.","new_name":"نمط ألوان جديد","copy_name_prefix":"نسخة من","delete_confirm":"حذف جميع الالوان؟","undo":"تراجع","undo_title":"التراجع عن تغيير اللن الى اللون السابق","revert":"تراجع","revert_title":"اعادة ضبط اللون الى اللون الافتراضي للموقع","primary":{"name":"اساسي","description":"Most text, icons, and borders."},"secondary":{"name":"ثانوي","description":"اللون الاساسي للخلفية, والنص للايقونة"},"tertiary":{"name":"ثلاثي","description":"الروابط، الأزرار، الإشعارات و أشياء أخرى."},"quaternary":{"name":"رباعي","description":"الروابط"},"header_background":{"name":"خلفية رأس الصفحة","description":"لون الخلفية لرأس الصفحة الخاصة بالموقع"},"header_primary":{"name":"رأس الصفحة الأساسي","description":"لون و أيقونات رأس الصفحة الخاصة بالموقع."},"highlight":{"name":"تحديد","description":"لون خلفية النصوص و العناصر المحددة في جسم الصفحة مثل المشاركات و المواضيع."},"danger":{"name":"خطر","description":"لون  بعض الأوامر مثل حذف المشاركات و المواضيع"},"success":{"name":"نجاح","description":"يستخدم لإظهار نجاح عملية ما."},"love":{"name":"إعجاب","description":"لون زر الإعجاب."},"wiki":{"name":"ويكي","description":"اللون الأساسي المستخدم كخلفية لمشاركات الويكي."}}},"email":{"title":"بريد الكتروني","settings":"اعدادات","all":"الكل","sending_test":"إرسال بريد إلكتروني للتجربة...","error":"\u003cb\u003eخطأ\u003c/b\u003e - %{server_error}","test_error":"حدث خطأ أثناء إرسال رسالة تجريبية. الرجاء فحص إعدادات البريد الإلكتروني و التأكد من أن الاستضافة لا تمنع مرور البريد الإلكتروني والمحاولة مرة أخرى.","sent":"تم الإرسال","skipped":"تم التجاوز","sent_at":"أرسلت في","time":"الوقت","user":"المستخدم","email_type":"نوع البريد الكتروني","to_address":"الى العناوين","test_email_address":"عنوان البريد الكتروني للتجربة","send_test":"ارسل رسالة تجربة","sent_test":"اٌرسلت!","delivery_method":"طريقة التسليم","preview_digest":"ملخص المعاينة.","preview_digest_desc":"معاينة محتوى رسائل البريد الإلكتروني الملخص المرسلة للأعضاء الغير متاحين.","refresh":"تحديث","format":"التنسيق","html":"html","text":"نص","last_seen_user":"آخر مستخدم تواجد:","reply_key":"مفتاح الرد","skipped_reason":"تجاوز السبب","logs":{"none":"لا يوجد سجلات.","filters":{"title":"المنقي","user_placeholder":"اسم المستخدم","address_placeholder":"name@example.com","type_placeholder":"الخلاصة، إنشاء حساب...","reply_key_placeholder":"مفتاح الرد","skipped_reason_placeholder":"السبب"}}},"logs":{"title":"سجلات","action":"عملية","created_at":"مكتوبة","last_match_at":"اخر تطابق","match_count":"تطابقات","ip_address":"IP","topic_id":"رقم معرّف الموضوع","post_id":"رقم المشاركة","category_id":"معرف الفئة","delete":"حذف","edit":"تعديل","save":"حفظ","screened_actions":{"block":"حظر","do_nothing":"لا تفعل شيء"},"staff_actions":{"title":"عمليات المشرفين","instructions":"إضغط على أسماء الإعضاء والإجراءات لتصفيه القائمة . إضغط على صورة العرض للإنتقال لصفحة العضو","clear_filters":"إظهار كل شيء","staff_user":"عضو  إداري","target_user":"عضو مستهدف","subject":"الموضوع","when":"متى","context":"السياق","details":"التفاصيل","previous_value":"معاينة","new_value":"جديد","diff":"الاختلافات","show":"إظهار","modal_title":"التفاصيل","no_previous":"لا يوجد قيمة سابقة.","deleted":"لايوجد قيمة جديدة , السجل قد حذف","actions":{"delete_user":"حذف المستخدم","change_trust_level":"تغيير مستوى الثقة","change_username":"تغيير اسم المستخدم","change_site_setting":"تغيير اعدادات الموقع","change_site_customization":"تخصيص الموقع","delete_site_customization":"حذف هذا التخصيص؟","suspend_user":"حظر المستخدم","unsuspend_user":"رفع الحظر ","grant_badge":"منح شارة","revoke_badge":"حذف الشعار","check_email":"التحقق من البريد","delete_topic":"حذف الموضوع","delete_post":"حذف المشاركة","impersonate":"إنتحال","anonymize_user":"مستخدم مجهول","roll_up":"عناوين IP المتغيرة المحظورة","change_category_settings":"تغيير إعدادات الفئة","delete_category":"حذف الفئة","create_category":"أنشئ فئة"}},"screened_emails":{"title":"عناوين بريد إلكتروني محجوبة.","description":"عندما تتم محاول انشاء حساب جديد, سيتم التحقق من قائمة البريد  الالكتروني وسيتم حظر التسجيل لهذا البريد واتخاذ اي اجراء متبع","email":"قائمة البريد الالكتروني","actions":{"allow":"سماح"}},"screened_urls":{"title":"عناوين مواقع محجوبة","description":"الروابط الالكترونية الموجودة هنا تم استخدامها في مشاركات  من قيل مستخدمين سبام ","url":"رابط","domain":"عنوان"},"screened_ips":{"title":"عناوين IP محجوبة","description":"عناوين IP التي شوهدت. أستخدم \"اسمح\" لإضافة عناوين IP للقائمة البيضاء.","delete_confirm":"هل أنت متأكد أنك تريد إزالة القاعدة لـ %{ip_address} ؟","roll_up_confirm":"هل أنت متأكد أنك تريد تغيير مصفي عناوين IP الشائعة إلى الشبكات الفرعية ؟","rolled_up_some_subnets":"تم بنجاح حظر IP متغير يدخل إلى هذه الشبكات الفرعية : %{subnets}.","rolled_up_no_subnet":"ليس هنالك شيء ليتدحرج","actions":{"block":"حظر","do_nothing":"سماح","allow_admin":"سماح المدير"},"form":{"label":"جديد:","ip_address":"عناوين الIP","add":"اضافة","filter":"بحث"},"roll_up":{"text":"متغير","title":"أنشئ مدخلات فرعية جديدة إذا كانت هذه على الأقل مدخلات 'min_ban_entries_for_roll_up'."}},"logster":{"title":"سجلات الخطأ."}},"impersonate":{"title":"انتحال الشخصية","help":"استخدم هذه الأداة لانتحال شخصية حساب مستخدم لأغراض التصحيح. سيتم تسجيل خروجك عندما تنتهي.","not_found":"ﻻيمكن إيجاد ذلك المستخدم.","invalid":"عذراً , لايمكنك تمثل شخصية ذلك العضو."},"users":{"title":"مستخدمين","create":"اضافة مدير","last_emailed":"آخر بريد الكتروني","not_found":"نعتذر، لا يوجد اسم المستخدم هذا في نظامنا.","id_not_found":"خطاء !! , إسم المستخدم غير موجود","active":"نشط","show_emails":"عرض الرسائل","nav":{"new":"جديد","active":"نشط","pending":"قيد الانتظار","staff":"الإدارة","suspended":"موقوف","blocked":"محظور","suspect":"مريب"},"approved":"موافقة؟","approved_selected":{"zero":"وافق المستخدم","one":"وافق المستخدم","two":" وافق المستخدمين ({{count}})","few":" وافق المستخدمين ({{count}})","many":" وافق المستخدمين ({{count}})","other":" وافق المستخدمين ({{count}})"},"reject_selected":{"zero":"رفض المستخدمين","one":"رفض المستخدم","two":"رفض المستخدمين ({{count}})","few":"رفض المستخدمين ({{count}})","many":"رفض المستخدمين ({{count}})","other":"رفض المستخدمين ({{count}})"},"titles":{"active":"مستخدمين نشطين","new":"مستخدمين جدد ","pending":"أعضاء بانتظار المراجعة","newuser":"أعضاء في مستوى الثقة 0 (عضو جديد)","basic":"أعضاء في مستوى الثقة 1 (عضو أساسي)","member":"الاعضاء في مستوى الثقة رقم 2 (أعضاء)","regular":"الاعضاء في مستوى الثقة رقم 3 (عاديين)","leader":"الاعضاء في مستوى الثقة رقم 4 (قادة)","staff":"طاقم","admins":"مستخدمين مدراء","moderators":"مراقبين","blocked":"مستخدمين محظورين:","suspended":"أعضاء موقوفين","suspect":"أعضاء مريبين"},"reject_successful":{"zero":"رفض بنجاح 1 مستخدم","one":"رفض بنجاح 1 مستخدم","two":"رفض بنجاح %{count} مستخدمين.","few":"رفض بنجاح %{count} مستخدمين.","many":"رفض بنجاح %{count} مستخدمين.","other":"رفض بنجاح %{count} مستخدمين."},"reject_failures":{"zero":"فشل لرفض 1 مستخدم.","one":"فشل لرفض 1 مستخدم.","two":"فشل لرفض %{count} مستخدمين.","few":"فشل لرفض %{count} مستخدمين.","many":"فشل لرفض %{count} مستخدمين.","other":"فشل لرفض %{count} مستخدمين."},"not_verified":"لم يتم التحقق","check_email":{"title":"اظهار عوان البريد الالكتروني لهذا العضو.","text":"إظهار"}},"user":{"suspend_failed":"حدث خطأ ما أوقف هذا المستخدم {{error}}.","unsuspend_failed":"حدث خطأ ما لم يوقف هذا المستخدم {{error}}.","suspend_duration":"كم هي مدة تعلّيق العضو ؟","suspend_duration_units":"(أيام)","suspend_reason_label":"لماذا هل أنت عالق؟ هذا النص \u003cb\u003eسيكون ظاهراً للكل\u003c/b\u003e على صفحة تعريف هذا العضو, وسيكون ظاهراً للعضو عندما يحاول تسجل الدخول. احفظها قصيرة.","suspend_reason":"سبب","suspended_by":"محظور من قبل","delete_all_posts":"حذف جميع المشاركات","delete_all_posts_confirm":"هل أنت متأكد من أنك تريد حذف %{posts}  مشاركات و  %{topics}  مواضيع ؟","suspend":"علّق","unsuspend":"إلقاء التعليق","suspended":"معلّق؟","moderator":"مراقب؟","admin":"مدير؟","blocked":"محظور؟","show_admin_profile":"مدير","edit_title":"تعديل العنوان","save_title":"حفظ العنوان","refresh_browsers":"تحديث المتصفحات اجبارياً","refresh_browsers_message":"الرسالة أُرسلت إلى كل الأعضاء!","show_public_profile":"عرض الملف العام.","impersonate":"انتحال شخصية","ip_lookup":"جدول \"IP\"","log_out":"تسجيل الخروج","logged_out":"العضو قام بتسجيل الخروج من جميع الأجهزه","revoke_admin":"سحب الإدارة","grant_admin":"منحة إدارية","revoke_moderation":"سحب المراقبة","grant_moderation":"منحة مراقبة","unblock":"إلغاء حظر","block":"حظر","reputation":"شهرة","permissions":"صلاحيات","activity":"أنشطة","like_count":"الإعجابات المعطاة / المستلمة","last_100_days":"في آخر 100 يوم","private_topics_count":"موضوع خاص","posts_read_count":"المشاركات المقروءة","post_count":"المشاركات المنشأة","topics_entered":"المواضيع المشاهدة","flags_given_count":"مبلغ عنه","flags_received_count":"تم إستلام بلاغ","warnings_received_count":"تحذيرات مستلمه","flags_given_received_count":"تم التبليغ ","approve":"تصديق","approved_by":"مصدق بواسطة","approve_success":"تم تسجيل العضوية  و إرسال رسالة الى بريد العضو  بتعليمات التفعيل ","approve_bulk_success":"تم ! جميع الأعضاء المحددين تم توثيقهم وتنبيهم ","time_read":"وقت القراءة","anonymize":"مستخدم مجهول","anonymize_confirm":"هل أنت متأكد أنك تريد هذا الحساب مجهول؟ هذا سيغير اسم المستخدم والبريد الإلكتروني، ويعيد تعين كل معلومات ملف التعريف.","anonymize_yes":"نعم، أخفي هذا الحساب.","anonymize_failed":"كانت هناك مشكلة من حساب مجهول المصدر","delete":"حذف المستخدم","delete_forbidden_because_staff":"لا يمكن حذف مدراء والمشرفين.","delete_posts_forbidden_because_staff":"لا يمكن حذف جميع المشاركات للمدراء والمشرفين.  ","delete_forbidden":{"zero":"لا يمكن حذف الأعضاء إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو.","one":"لا يمكن للأعضاء الحذف إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو. (المشاركات الأقدم من يوم لا يمكن حذفها.)","two":"لا يمكن حذف الأعضاء إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو. (المشاركات الأقدم من يومين لا يمكن حذفها.)","few":"لا يمكن حذف الأعضاء إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو.\n(المشاركات الأقدم من أيام قليلة لا يمكن حذفها.)","many":"لا يمكن حذف الأعضاء إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو. (المشاركات الأقدم من أيام %{كثيرة} لا يمكن حذفها.)","other":"لا يمكن للأعضاء الحذف إذا كان لديهم مشاركات. احذف جميع المشاركات قبل المحاولة بحذف العضو. (المشاركات الأقدم من %{count} أيام لا يمكن حذفها.)"},"cant_delete_all_posts":{"zero":"لا تستطيع حذف جميع المشاركات. (The delete_user_max_post_age setting.)","one":"لا تستطيع حذف جميع المشاركات. بعض المشاركات أقدم من يوم. (The delete_user_max_post_age setting.)","two":"لا تستطيع حذف جميع المشاركات. بعض المشاركات أقدم من يومين. (The delete_user_max_post_age setting.)","few":"لا تستطيع حذف جميع المشاركات. بعض المشاركات أقدم من أيام قليلة. (The delete_user_max_post_age setting.)","many":"لا تستطيع حذف جميع المشاركات. بعض المشاركات أقدم من أيام %{كثيرة}. (The delete_user_max_post_age setting.)","other":"لا تستطيع حذف جميع المشاركات. بعض المشاركات أقدم من %{count} أيام. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"zero":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركة.\n(delete_all_posts_max)","one":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركة.\n(delete_all_posts_max)","two":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركتين.\n(delete_all_posts_max)","few":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركات.\n(delete_all_posts_max)","many":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركة.\n(delete_all_posts_max)","other":"لا يمكن مسح كل المشاركات لأن العضو لديه أكثر من %{count} مشاركة.\n(delete_all_posts_max)"},"delete_confirm":"هل أنت متأكد من حذف هذا العضو ؟ الحذف نهائي بلا رجعه","delete_and_block":"حذف و \u003cb\u003eحظر\u003c/b\u003e this email and IP address","delete_dont_block":"حذفه فقط","deleted":"تم حذف المستخدم.","delete_failed":"حدث خطأ عند حذف المستخدم. يجب التاكد من انك حذفت جميع مشاركات المستخدم قبل محاولة حذف المستخدم.","send_activation_email":"ارسل رسالة تفعيل","activation_email_sent":"تم ارسال رسالة التفعيل الى البريد.","send_activation_email_failed":"حدث خطأ عند محاولة ارسال رسالة تفعيل مرّة أخرى. %{error}","activate":"تفعيل الحساب","activate_failed":"حدث خطأ عند تفعيل هذا المستخدم.","deactivate_account":"تعطيل الحساب","deactivate_failed":"حدث خطأ عند تعطيل هذا المستخدم.","unblock_failed":"حدث خطأ عند الغاء حظر هذا المستخدم.","block_failed":"حدث خطأ عند حظر هذا المستخدم.","deactivate_explanation":"المستخدم الغير نشط يحب أن يتأكد من البريد الالكتروني","suspended_explanation":"المستخدم الموقوف لايملك صلاحية تسجيل الدخول","block_explanation":"المستخدم الموقوف لايستطيع أن يشارك","trust_level_change_failed":"هناك مشكلة في تغيير مستوى ثقة المستخدم ","suspend_modal_title":"حظر المستخدم","trust_level_2_users":"أعضاء مستوى الثقة 2.","trust_level_3_requirements":"متطلبات مستوى الثقة 3.","trust_level_locked_tip":"مستوى الثقة مغلق، والنظام لن يرقي أو سيخفض رتبة العضو.","trust_level_unlocked_tip":"مستوى الثقة غير مؤمن، والنظام قد ترقية أو تخفيض المستعمل ","lock_trust_level":"قفل مستوى الثقة","unlock_trust_level":"فتح مستوى الثقة ","tl3_requirements":{"title":"المتطلبات لمستوى الثقة 3.","table_title":"في آخر 100 يوم","value_heading":"تصويت","requirement_heading":"متطلبات","visits":"الزيارات","days":"أيام","topics_replied_to":"مواضيع للردود","topics_viewed":"المواضيع شوهدت","topics_viewed_all_time":"المواضيع المعروضة(جميع الأوقات)","posts_read":"المنشورات المقروءة","posts_read_all_time":"المشاركات المقروءة (جميع الاوقات)","flagged_posts":"المشاركات المبلغ عنها ","flagged_by_users":"المستخدمين الذين بلغوا","likes_given":"الإعجابات المعطاة","likes_received":"الإعجابات المستلمة","likes_received_days":"الإعجابات المستلمة : الايام الغير عادية","likes_received_users":"الإعجابات المستلمة : المستخدمين المميزين","qualifies":"مستوى الثقة الممنوحة للمستوى ","does_not_qualify":"غير مستحق للمستوى","will_be_promoted":"سيتم الترقية عنه قريبا","will_be_demoted":"سيتم التخفيض قريبا","on_grace_period":"حاليا في فترة مهلة ترقية، لن يتم تخفيض رتب.","locked_will_not_be_promoted":"مستوى الثفة هذا لن يتم الترقية له نهائيا","locked_will_not_be_demoted":"مستوى الثفة هذا لن يتم الخفض له نهائيا"},"sso":{"title":"الدخول الموحد","external_id":"ID الخارجي","external_username":"أسم المستخدم","external_name":"الأسم","external_email":"البريد الإلكتروني","external_avatar_url":"رابط الملف الشخصي"}},"user_fields":{"title":"حقول المستخدم","help":"إضافة الحقول التي يمكن للمستخدمين ملئها .","create":"أضف حقل مستخدم","untitled":"بدون عنوان","name":"اسم الحقل","type":"نوع الحقل ","description":"حقل الوصف","save":"حفظ","edit":"تعديل","delete":"حذف","cancel":"إلغاء","delete_confirm":"هل انت متأكد من انك تريد حذف هذا الحقل ؟","options":"خيارات","required":{"title":"المطلوب للأشتراك ؟","enabled":"مطلوب","disabled":"غير مطلوب"},"editable":{"title":"التعديل بعد انشاء الحساب ؟","enabled":"تعديل","disabled":"غير قابل للتعديل"},"show_on_profile":{"title":"عرض في الملف الشحصي العام؟","enabled":"عرض في الملف الشخصي","disabled":"عدم الأظهار في الملف الشخصي"},"field_types":{"text":"حقل النص","confirm":"تأكيد","dropdown":"القائمة المنسدلة"}},"site_text":{"none":"اختر نوع المحتوى المراد تعديله","title":"محتوى النص"},"site_settings":{"show_overriden":"تظهر فقط تجاوز","title":"اعدادات","reset":"إعادة تعيين","none":"لا شيء","no_results":"لا توجد نتائج.","clear_filter":"مسح","add_url":"أضافة رابط","add_host":"أضافة نطاق","categories":{"all_results":"كل","required":"مطلوب","basic":"الإعداد الأساسي","users":"مستخدمون","posting":"مشاركة","email":"البريد الإلكتروني","files":"ملفات","trust":"المستويات الموثوقة","security":"أمن","onebox":"رابط تفصيلي","seo":"SEO","spam":"سخام","rate_limits":"حدود المعدل","developer":"المطور","embedding":"تضمين","legal":"قانوني","uncategorized":"أخرى","backups":"النسخ الإحتياطية","login":"تسجيل الدخول","plugins":"الإضافات ","user_preferences":"تفضيلات العضو"}},"badges":{"title":"شعارات ","new_badge":"شعار جديد","new":"جديد ","name":"إسم ","badge":"شعار ","display_name":"إسم العرض","description":"الوصف","badge_type":"نوع الشعار","badge_grouping":"المجموعة","badge_groupings":{"modal_title":"تجميع الشعارات "},"granted_by":"ممنوح بواسطة ","granted_at":"ممنوح في","reason_help":"( رابط إلى مشاركة أو موضوع )","save":"حفظ","delete":"حذف","delete_confirm":"هل أنت متأكد من أنك تريد حذف هذا الشعار ؟","revoke":"تعطيل","reason":"السبب","expand":"توسيع \u0026مساعدة;","revoke_confirm":"هل أنت متأكد أنك تريد سحب هذه الشارة؟","edit_badges":"تعديل الشعارات ","grant_badge":"منح شارة","granted_badges":"أوسمة ممنوحة.","grant":"منحة","no_user_badges":"%{name} لم يمنح أي شارة.","no_badges":"لا يوجد أي شارة يمكن منحها.","none_selected":"حدد شارة البدء","allow_title":"اسمح للشارة أن تستخدم كعنوان.","multiple_grant":"يمكن منحه عدة مرات. ","listable":"اظهار الوسام على صفحة الأوسمة العامة","enabled":"تفعيل الشعار","icon":"أيقونة","image":"صورة","icon_help":"إستخدم فئة الخط او رابط الى صورة","query":"علامة استفهام (SQL)","target_posts":"إستعلام يستهدف المشاركات","auto_revoke":"إلغاء الاستعلام اليومي","show_posts":"عرض مشاركة الوسام الممنوح على صفحة الوسام.","trigger":"مطلق","trigger_type":{"none":"تحديث يومي","post_action":"عندما يعمل عضو على مشاركة.","post_revision":"عندما يقوم عضو بتعديل أو إنشاء مشاركة.","trust_level_change":"عندما يقوم شخص بتغير مستوى الثقة.","user_change":"عندما يتم تعديل عضو أو انشاءه."},"preview":{"link_text":"معاينة الأوسمة الممنوحة.","plan_text":"معاينة مع خطة الاستعلام.","modal_title":"معاينة علامة استفهام","sql_error_header":"كان هناك خطأ ما في الاستعلام.","error_help":"انظر الرابط التالي للمساعدة باستفسارات الوسام.","bad_count_warning":{"header":"تحذير !!","text":"هناك عينات ممنوحة ضائعة. حدث هذا عندما أعادت شارة الإستعلام user IDs أو post IDs التي لم تكن موجودة. هذا ربما بسبب نتيجة غير متوقعة في وقت لاحق - رجائا أنقر مرتين للتأكد من إستعلامك-"},"no_grant_count":"لا توجد اوسمه لتمنح ","grant_count":{"zero":"\u003cb\u003e%{count}\u003c/b\u003e وساما لتمنح .","one":"وسام واحد ليتم منحه .","two":"وسامين ليتم منحهما .","few":"\u003cb\u003e%{count}\u003c/b\u003e أوسمة لتمنح .","many":"\u003cb\u003e%{count}\u003c/b\u003e وساما لتمنح .","other":"\u003cb\u003e%{count}\u003c/b\u003e وساما لتمنح ."},"sample":"أمثلة:","grant":{"with":"\u003cspan class=\"username\"\u003e%{أسم المستخدم}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{أسم المستخدم}\u003c/span\u003e لهذه المشاركة %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{أسم المستخدم}\u003c/span\u003e لهذه المشاركة %{link} at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{أسم المستخدم}\u003c/span\u003e في \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"الوجه التعبيري","help":"أضف رموز تعبيرية جديدة التي سوف تكون متاحة للكل . (PROTIP: drag \u0026 drop multiple files at once)","add":"أضافة وجه تعبيري جديد ؟","name":"الأسم","image":"صورة","delete_confirm":"هل أنت متأكد من انك تريد حذف هذا  :%{name}: الوجه التعبيري ؟"},"embedding":{"get_started":"إذا أردت تضمين Discourse في موقع اخر، أبدأ بإضافة مضيف.","confirm_delete":"هل انت متأكد من انك تريد حذف هذا المضيف ؟","sample":"استخدم كود HTML التالي لموقعك لإنشاء وتضمين موضوع discourse. استبدل \u003cb\u003eREPLACE_ME\u003c/b\u003e مع canonical URL لصفحة قمت بتضمينها فيه.","title":"تضمين","host":"أسمع بالمضيفين","edit":"تعديل","category":"مشاركة لفئة","add_host":"أضف مضيف","settings":"تضمين إعدادات","feed_settings":"إعدادات التغذية ","feed_description":" توفير مغذي RSS/ATOM لموقعك سيطور قدرة Discourse على استيراد المحتوى الخاص بك.","crawling_settings":"إعدادات المتقدم ببطء.","crawling_description":"عندما ينشأ Discourse مواضيع لمشاركتك، إذا لم يتوفر مغذي RSS/ATOM سيحاول تحليل محتواك من HTML الخاص بك. أحيانا يمكن أن يكون تحديا استخراج محتواك، لذا نمنحك القدرة لتحديد قواعد CSS لجعل الاستخراج أسهل.","embed_by_username":"اسم العضو للموضوع المنشأ","embed_post_limit":"أقصى عدد مشاركات مضمنة","embed_username_key_from_feed":"مفتاح لسحب اسم عضو discourse من المغذي","embed_truncate":"بتر المشاركات المضمنة","embed_whitelist_selector":"منتقي CSS للعناصر التي تسمح في التضمينات.","embed_blacklist_selector":"منتقي CSS للعناصر التي حذفت من التضمينات.","feed_polling_enabled":"استورد المشاركات عبر RSS/ATOM","feed_polling_url":"URL مغذي RSS/ATOM يتقدم ببطء.","save":"أحفظ الإعدادات المضمنة"},"permalink":{"title":"الرابط الثابت","url":"رابط","topic_id":"رقم الموضوع","topic_title":"موضوع","post_id":"رقم المشاركة","post_title":"مشاركة","category_id":"رقم الفئة","category_title":"تصنيف","external_url":"رابط خارجي","delete_confirm":"هل أنت متأكد من حذف هذا الرابط الثابت ؟","form":{"label":"جديد :","add":"أضف","filter":"بحث  ( رابط داخلي أو خارجي )"}}},"lightbox":{"download":"تحميل"},"search_help":{"title":"بحث عن المساعدة"},"keyboard_shortcuts_help":{"title":"أختصارات لوحة المفاتيح","jump_to":{"title":"اقفز إلى","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e الرئيسية","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e الأخير","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e جديد","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e لم يقرأ","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e الفئات","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e الأعلى","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e الإشارات المرجعية","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e ملف التعريف","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e الرسائل"},"navigation":{"title":"المتصفح","jump":"\u003cb\u003e#\u003c/b\u003e الذهاب الى الموضوع #","back":"\u003cb\u003eu\u003c/b\u003eخلف","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e نقل المحدد \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e أو \u003cb\u003eأدخل\u003c/b\u003e فتح الموضوع المحدد","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e القسم التالي/السابق"},"application":{"title":"التطبيقات","create":"\u003cb\u003ec\u003c/b\u003e انشاء موضوع جديد","notifications":"\u003cb\u003en\u003c/b\u003e فتح الإشعارات","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e فتح قائمة الموقع","user_profile_menu":"\u003cb\u003ep\u003c/b\u003eأفتح قائمة المستخدم","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e عرض المواضيع المحدثة","search":"\u003cb\u003e/\u003c/b\u003e البحث","help":"\u003cb\u003ep\u003c/b\u003eأفتح قائمة المستخدم","dismiss_new_posts":"تجاهل جديد / المشاركات \u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e رفض المواضيع","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e تسجيل خروج"},"actions":{"title":"إجراءات","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e تبديل علامة مرجعية الموضوع","pin_unpin_topic":"ثبت/عدم التثبيت للموضوع \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e ","share_topic":"مشاركة الموضوع \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e","share_post":"\u003cb\u003es\u003c/b\u003e مشاركة الموضوع","reply_as_new_topic":"الرد في موضوع مرتبط \u003cb\u003et\u003c/b\u003e","reply_topic":"رد على الموضوع \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e","reply_post":"\u003cb\u003er\u003c/b\u003e الرد على الموضوع","quote_post":"\u003cb\u003eq\u003c/b\u003e اقتباس المشاركة","like":"\u003cb\u003el\u003c/b\u003e الأعجاب بالموضوع","flag":"تعليم المشاركة \u003cb/\u003e!\u003cb\u003e","bookmark":"\u003cb\u003eb\u003c/b\u003e الإشارات المرجعية الخاصة بالموضوع","edit":"\u003cb\u003el\u003c/b\u003e  تعديل الموضوع","delete":"\u003cb\u003ed\u003c/b\u003e حذف الموضوع","mark_muted":"صمّت الموضوع  \u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e موضوع منظم (الإفتراضي)","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e  تابع الموضوع","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e شاهد الموضوع"}},"badges":{"title":"أوسمة","allow_title":"يمكن استخدامه كعنوان","multiple_grant":"يمكن منحه عدة مرات. ","badge_count":{"zero":"%{count} شاره","one":"%{count} شاره","two":"%{count} شاراتين","few":"%{count} أوسمة","many":"%{count} أوسمة","other":"%{count} أوسمة"},"more_badges":{"zero":"+%{count} المزيد","one":"+%{count} المزيد","two":"+%{count} المزيد","few":"+%{count} المزيد","many":"+%{count} المزيد","other":"+%{count} المزيد"},"granted":{"zero":"ﻻيوجد ممنوحات.","one":"ممنوح واحد.","two":"ممنوحان.","few":"%{count} ممنوحات.","many":"%{count} ممنوحات.","other":"%{count} ممنوحات."},"select_badge_for_title":"حدد وسام لتستخدمه كعنوانك","none":"لا شئ","badge_grouping":{"getting_started":{"name":"البداية"},"community":{"name":"مجتمع"},"trust_level":{"name":"مستوى الثقة"},"other":{"name":"الجميع"},"posting":{"name":"نشر"}},"badge":{"editor":{"name":"محرر","description":"أول موضوع تم تحريره"},"basic_user":{"name":"أساسي","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eمنح\u003c/a\u003e جميع وظائف المجتمع الأساسية."},"member":{"name":"عضو","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eمُنح\u003c/a\u003e دعوات"},"regular":{"name":"منتظم","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eمنح\u003c/a\u003e اعادة تصنيف, اعادة تسمية, اتباع الروابط"},"leader":{"name":"قائد","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eمنح\u003c/a\u003e تحرير عام, تثبيت, اغلاق, ارشفة, تقسيم ودمج"},"welcome":{"name":"مرحباً","description":"تلقيت إعجاب"},"autobiographer":{"name":"الكاتب سيرته بنفسه","description":"تصفية عضو \u003ca href=\"/my/preferences\"\u003eملف التعريف \u003c/a\u003eمعلومات"},"anniversary":{"name":"ذكرى","description":"عضو نشط لمدة عام، شارك مرة واحدة على الأقل"},"nice_post":{"name":"منشور رائع","description":"تلقيت 10 إعجاب لهذه المشاركة . هذا الاشعار يتم إرسالة مرات عديدة "},"good_post":{"name":"منشور جيد","description":"تلقيت 25 إعجاب لهذه المشاركة . هذا الاشعار يتم إرسالة مرات عديدة"},"great_post":{"name":"منشور ممتاز","description":"تلقيت 50 إعجاب لهذه المشاركة . هذا الاشعار يتم إرسالة مرات عديدة"},"nice_topic":{"name":"موضوع رائع ","description":"تلقيت 10 إعجاب لهذا الموضوع . هذا الاشعار يتم إرسالة مرات عديدة"},"good_topic":{"name":"موضوع جيد","description":"تلقيت 25 إعجاب لهذا الموضوع . هذا الوسام يتم منحه عدة مرات"},"great_topic":{"name":"موضوع ممتاز","description":"تلقيت 50 إعجاب لهذا الموضوع . هذا الوسام يتم منحه عدة مرات"},"nice_share":{"name":"مشاركة رائعة","description":"تم مشاركة رد مع أكثر من 25 زائر"},"good_share":{"name":"مشاركة جيدة","description":"تم مشاركة رد مع أكثر من 300 زائر"},"great_share":{"name":"مشاركة ممتازة","description":"تم مشاركة رد مع أكثر من 1000 زائر"},"first_like":{"name":"اول اعجاب","description":"أعجب في رد"},"first_flag":{"name":"اول بلاغ","description":"مشاركة مبلغ عنها"},"promoter":{"name":"متعهد","description":"دعوة مستخدم"},"campaigner":{"name":"ناشط","description":"تم دعوة 3 أعضاء (مستوى الثقة 1)"},"champion":{"name":"بطل","description":"تم دعوة 5 أعضاء (مستوى الثقة 2)"},"first_share":{"name":"اول مشاركة","description":"مشاركة تعليق"},"first_link":{"name":"الرابط الأول","description":"اضافة رابط لموضوع اخر"},"first_quote":{"name":"التعليق الأول","description":"إقتباسات"},"read_guidelines":{"name":"اقرأ التعليمات","description":"اطلع على  \u003ca href=\"/guidelines\"\u003eتوجيهات المجتمع\u003c/a\u003e"},"reader":{"name":"قارئ","description":"قراءة أكثر من 100 تعليق في الموضوع"},"popular_link":{"name":"رابط مشهور","description":"شارك رابط خارجي بـ  50 نقرة على الأقل."},"hot_link":{"name":"الرابط الساخن","description":"شارك الرابط الخارجي بـ 300 نقرة على الأقل."},"famous_link":{"name":"رابط مشهور","description":"شارك الرابط الخارجي بـ 1000 نقرة على الأقل"}}},"google_search":"\u003ch3\u003eابحث في قوقل\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eقوقل\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","controls":"Topic Controls"},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'ar';
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
// locale : Arabic (ar)
// author : Abdel Said : https://github.com/abdelsaid
// changes in months, weekdays : Ahmed Elkhatib

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    var symbolMap = {
        '1': '١',
        '2': '٢',
        '3': '٣',
        '4': '٤',
        '5': '٥',
        '6': '٦',
        '7': '٧',
        '8': '٨',
        '9': '٩',
        '0': '٠'
    }, numberMap = {
        '١': '1',
        '٢': '2',
        '٣': '3',
        '٤': '4',
        '٥': '5',
        '٦': '6',
        '٧': '7',
        '٨': '8',
        '٩': '9',
        '٠': '0'
    };

    return moment.defineLocale('ar', {
        months : "يناير/ كانون الثاني_فبراير/ شباط_مارس/ آذار_أبريل/ نيسان_مايو/ أيار_يونيو/ حزيران_يوليو/ تموز_أغسطس/ آب_سبتمبر/ أيلول_أكتوبر/ تشرين الأول_نوفمبر/ تشرين الثاني_ديسمبر/ كانون الأول".split("_"),
        monthsShort : "يناير/ كانون الثاني_فبراير/ شباط_مارس/ آذار_أبريل/ نيسان_مايو/ أيار_يونيو/ حزيران_يوليو/ تموز_أغسطس/ آب_سبتمبر/ أيلول_أكتوبر/ تشرين الأول_نوفمبر/ تشرين الثاني_ديسمبر/ كانون الأول".split("_"),
        weekdays : "الأحد_الإثنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت".split("_"),
        weekdaysShort : "أحد_إثنين_ثلاثاء_أربعاء_خميس_جمعة_سبت".split("_"),
        weekdaysMin : "ح_ن_ث_ر_خ_ج_س".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        meridiem : function (hour, minute, isLower) {
            if (hour < 12) {
                return "ص";
            } else {
                return "م";
            }
        },
        calendar : {
            sameDay: "[اليوم على الساعة] LT",
            nextDay: '[غدا على الساعة] LT',
            nextWeek: 'dddd [على الساعة] LT',
            lastDay: '[أمس على الساعة] LT',
            lastWeek: 'dddd [على الساعة] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "في %s",
            past : "منذ %s",
            s : "ثوان",
            m : "دقيقة",
            mm : "%d دقائق",
            h : "ساعة",
            hh : "%d ساعات",
            d : "يوم",
            dd : "%d أيام",
            M : "شهر",
            MM : "%d أشهر",
            y : "سنة",
            yy : "%d سنوات"
        },
        preparse: function (string) {
            return string.replace(/[۰-۹]/g, function (match) {
                return numberMap[match];
            }).replace(/،/g, ',');
        },
        postformat: function (string) {
            return string.replace(/\d/g, function (match) {
                return symbolMap[match];
            }).replace(/,/g, '،');
        },
        week : {
            dow : 6, // Saturday is the first day of the week.
            doy : 12  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM، YYYY'); };
moment.fn.longDate = function(){ return this.format('D MMMM, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
