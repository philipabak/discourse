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
MessageFormat.locale.ru = function (n) {
  var r10 = n % 10, r100 = n % 100;

  if (r10 == 1 && r100 != 11)
    return 'one';

  if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) && n == Math.floor(n))
    return 'few';

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
r += "У вас ";
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
r += "<a href='/unread'>1 непрочитанное</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "<a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " непрочитанных</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ru"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>1 новая</a> тема";
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
})() + " новых</a> тем";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ru"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " осталось, или ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "посмотреть другие темы в";
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
r += "В этой теме ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 сообщение";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " сообщений";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["ru"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "с высоким рейтингом симпатий";
return r;
},
"med" : function(d){
var r = "";
r += "с очень высоким рейтингом симпатий";
return r;
},
"high" : function(d){
var r = "";
r += "с чрезвычайно высоким рейтингом симпатий";
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
}});I18n.translations = {"ru":{"js":{"number":{"format":{"separator":",","delimiter":" "},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Байт","few":"Байта","many":"Байт","other":"Байт"},"gb":"ГБ","kb":"КБ","mb":"МБ","tb":"ТБ"}}},"short":{"thousands":"{{number}} тыс.","millions":"{{number}} млн."}},"dates":{"time":"HH:mm","long_no_year":"D MMM HH:mm","long_no_year_no_time":"D MMM","full_no_year_no_time":"MMMM Do","long_with_year":"D MMM YYYY, HH:mm","long_with_year_no_time":"D MMM, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"D MMM YY, LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM YYYY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM YYYY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1мин","less_than_x_seconds":{"one":"\u003c 1сек","few":"\u003c %{count}сек","many":"\u003c %{count}сек","other":"\u003c %{count}сек"},"x_seconds":{"one":"1с","few":"%{count}с","many":"%{count}с","other":"%{count}с"},"less_than_x_minutes":{"one":"\u003c 1мин","few":"\u003c %{count}мин","many":"\u003c %{count}мин","other":"\u003c %{count}мин"},"x_minutes":{"one":"1мин","few":"\u003c %{count}мин","many":"\u003c %{count}мин","other":"\u003c %{count}мин"},"about_x_hours":{"one":"1ч","few":"%{count}ч","many":"%{count}ч","other":"%{count}ч"},"x_days":{"one":"1д","few":"%{count}д","many":"%{count}д","other":"%{count}д"},"about_x_years":{"one":"1год","few":"%{count}года","many":"%{count}лет","other":"%{count}лет"},"over_x_years":{"one":"\u003e 1 года","few":"\u003e %{count} лет","many":"\u003e %{count} лет","other":"\u003e %{count} лет"},"almost_x_years":{"one":"1 год","few":"%{count} года","many":"%{count} лет","other":"%{count} лет"},"date_month":"D MMM","date_year":"MMM YYYY"},"medium":{"x_minutes":{"one":"1 минута","few":"%{count} минуты","many":"%{count} минут","other":"%{count} минут"},"x_hours":{"one":"1 час","few":"%{count} часа","many":"%{count} часов","other":"%{count} часов"},"x_days":{"one":"1 день","few":"%{count} дня","many":"%{count} дней","other":"%{count} дней"},"date_year":"D MMM, YYYY"},"medium_with_ago":{"x_minutes":{"one":"1 минуту назад","few":"%{count} минуты назад","many":"%{count} минут назад","other":"%{count} минут назад"},"x_hours":{"one":"1 час назад","few":"%{count} часа назад","many":"%{count} часов назад","other":"%{count} часов назад"},"x_days":{"one":"1 день назад","few":"%{count} дня назад","many":"%{count} дней назад","other":"%{count} дней назад"}},"later":{"x_days":{"one":"1 день спустя","few":"%{count} дня спустя","many":"%{count} дней спустя","other":"%{count} дней спустя"},"x_months":{"one":"1 месяц спустя","few":"%{count} месяца спустя","many":"%{count} месяцев спустя","other":"%{count} месяцев спустя"},"x_years":{"one":"1 год спустя","few":"%{count} года спустя","many":"%{count} лет спустя","other":"%{count} лет спустя"}}},"share":{"topic":"Поделиться ссылкой на эту тему","post":"Ссылка на сообщение №%{postNumber}","close":"Закрыть","twitter":"Поделиться ссылкой через Twitter","facebook":"Поделиться ссылкой через Facebook","google+":"Поделиться ссылкой через Google+","email":"Поделиться ссылкой по электронной почте"},"action_codes":{"split_topic":"Разделил эту тему %{when}","autoclosed":{"enabled":"Закрыл тему %{when}","disabled":"Открыл тему %{when}"},"closed":{"enabled":"Закрыл тему %{when}","disabled":"Открыл тему %{when}"},"archived":{"enabled":"Заархивировал тему %{when}","disabled":"Разархивировал тему %{when}"},"pinned":{"enabled":"Закрепил тему %{when}","disabled":"Открепил тему %{when}"},"pinned_globally":{"enabled":"Закрепил тему глобально %{when}","disabled":"Открепил тему глобально %{when}"},"visible":{"enabled":"Включил в списки %{when}","disabled":"Исключил из списков %{when}"}},"topic_admin_menu":"действия администратора над темой","emails_are_disabled":"Все исходящие письма были глобально отключены администратором. Уведомления любого вида не будут отправляться на почту.","edit":"отредактировать название и раздел темы","not_implemented":"Извините, эта функция еще не реализована!","no_value":"Нет","yes_value":"Да","generic_error":"Извините, произошла ошибка.","generic_error_with_reason":"Произошла ошибка: %{error}","sign_up":"Зарегистрироваться","log_in":"Войти","age":"Возраст","joined":"Зарегистрировался","admin_title":"Админка","flags_title":"Жалобы","show_more":"показать дальше","show_help":"Cправка","links":"Ссылки","links_lowercase":{"one":"ссылка","few":"ссылки","other":"ссылок"},"faq":"Вопрос-ответ","guidelines":"Руководство","privacy_policy":"Политика конфиденциальности","privacy":"Политика конфиденциальности","terms_of_service":"Условия предоставления услуг","mobile_view":"Для мобильных устройств","desktop_view":"Для настольных устройств","you":"Вы","or":"или","now":"только что","read_more":"читать дальше","more":"Больше","less":"Меньше","never":"никогда","daily":"ежедневно","weekly":"еженедельно","every_two_weeks":"каждые две недели","every_three_days":"каждые 3 дня","max_of_count":"{{count}} макс.","alternation":"или","character_count":{"one":"{{count}} буква","few":"{{count}} буквы","many":"{{count}} букв","other":"{{count}} букв"},"suggested_topics":{"title":"Похожие темы"},"about":{"simple_title":"Информация","title":"Информация про %{title}","stats":"Статистика сайта","our_admins":"Наши администраторы","our_moderators":"Наши модераторы","stat":{"all_time":"За все время","last_7_days":"Последние 7 дней","last_30_days":"Последние 30 дней"},"like_count":"Симпатии","topic_count":"Темы","post_count":"Сообщения","user_count":"Новые пользователи","active_user_count":"Активные пользователи","contact":"Контакты","contact_info":"В случае возникновения критической ошибки или срочного дела, касающегося этого сайта, свяжитесь с нами по адресу %{contact_info}."},"bookmarked":{"title":"Избранное","clear_bookmarks":"Очистить закладки","help":{"bookmark":"Нажмите, чтобы добавить в закладки первое сообщение этой темы","unbookmark":"Нажмите, чтобы удалить все закладки в этой теме"}},"bookmarks":{"not_logged_in":"пожалуйста, войдите, чтобы добавлять сообщения в закладки","created":"вы добавили это сообщение в закладки","not_bookmarked":"вы прочитали это сообщение; нажмите, чтобы добавить его в закладки","last_read":"это последнее прочитанное вами сообщение; нажмите, чтобы добавить его в закладки","remove":"Удалить закладку","confirm_clear":"Вы уверены, что хотите удалить все эти темы из Избранного?"},"topic_count_latest":{"one":"1 новая или обновленная тема.","few":"{{count}} новые или обновленные темы.","many":"{{count}} новых или обновленных тем.","other":"{{count}} новых или обновленных тем."},"topic_count_unread":{"one":"1 непрочитанная тема.","few":"{{count}} непрочитанные темы.","many":"{{count}} непрочитанных тем.","other":"{{count}} непрочитанных тем."},"topic_count_new":{"one":"1 новая тема.","few":"{{count}} новые темы.","many":"{{count}} новых тем.","other":"{{count}} новых тем."},"click_to_show":"Показать.","preview":"предпросмотр","cancel":"отмена","save":"Сохранить","saving":"Сохранение...","saved":"Сохранено!","upload":"Загрузить","uploading":"Загрузка...","uploading_filename":"Загрузка файла {{filename}}...","uploaded":"Загружено!","enable":"Включить","disable":"Отключить","undo":"Отменить","revert":"Вернуть","failed":"Проблема","switch_to_anon":"Анонимный режим","switch_from_anon":"Выйти из анонимного режима","banner":{"close":"Больше не показывать это объявление.","edit":"Редактировать это объявление \u003e\u003e"},"choose_topic":{"none_found":"Не найдено ни одной темы.","title":{"search":"Искать тему по названию, ссылке или уникальному номеру:","placeholder":"введите название темы здесь"}},"queue":{"topic":"Тема:","approve":"Одобрить","reject":"Отклонить","delete_user":"Удалить пользователя","title":"Требуют одобрения","none":"Нет сообщений для проверки","edit":"Изменить","cancel":"Отменить","view_pending":"Просмотреть сообщения в очереди","has_pending_posts":{"one":"В этой теме \u003cb\u003e1\u003c/b\u003e сообщение, ожидающее проверки","few":"В этой теме \u003cb\u003e{{count}}\u003c/b\u003e сообщения, ожидающих проверки","many":"В этой теме \u003cb\u003e{{count}}\u003c/b\u003e сообщений, ожидающих проверки","other":"В этой теме \u003cb\u003e{{count}}\u003c/b\u003e сообщений, ожидающих проверки"},"confirm":"Сохранить","delete_prompt":"Вы уверены, что хотите удалить пользователя \u003cb\u003e%{username}\u003c/b\u003e? Это приведет к удалению всех его сообщений, а также заблокирует email и ip адрес.","approval":{"title":"Сообщения для проверки","description":"Ваше сообщение отправлено, но требует проверки и утверждения модератором. Пожалуйста, будьте терпеливы.","pending_posts":{"one":"\u003cstrong\u003e1\u003c/strong\u003e сообщение ожидает одобрения.","few":"\u003cstrong\u003e{{count}}\u003c/strong\u003e сообщений ожидают одобрения.","many":"\u003cstrong\u003e{{count}}\u003c/strong\u003e сообщений ожидают одобрения.","other":"\u003cstrong\u003e{{count}}\u003c/strong\u003e сообщений ожидают одобрения."},"ok":"ОК"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e создал \u003ca href='{{topicUrl}}'\u003eтему\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eВы\u003c/a\u003e создали \u003ca href='{{topicUrl}}'\u003eтему\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e ответил(а) на сообщение \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eВы\u003c/a\u003e ответили на сообщение \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e ответил(а) в \u003ca href='{{topicUrl}}'\u003eтеме\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eВы\u003c/a\u003e ответили в \u003ca href='{{topicUrl}}'\u003eтеме\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e упомянул \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e упомянул\u003ca href='{{user2Url}}'\u003eВас\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eВы\u003c/a\u003e упомянули \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Размещено пользователем \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Размещено \u003ca href='{{userUrl}}'\u003eВами\u003c/a\u003e","sent_by_user":"Отправлено пользователем \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Отправлено \u003ca href='{{userUrl}}'\u003eВами\u003c/a\u003e"},"directory":{"filter_name":"фильтр по имени пользователя","title":"Пользователи","likes_given":"Отправлено","likes_received":"Получено","topics_entered":"Посещено тем","topics_entered_long":"Посещено тем","time_read":"Время чтения","topic_count":"Тем","topic_count_long":"Тем создано","post_count":"Ответов","post_count_long":"Ответов написано","no_results":"Ничего не найдено.","days_visited":"Посещений","days_visited_long":"Дней посещения","posts_read":"Прочитано сообщений","posts_read_long":"Прочитано сообщений","total_rows":{"one":"1 пользователь","few":"%{count} пользователя","many":"%{count} пользователей","other":"%{count} пользователей"}},"groups":{"add":"Добавить","selector_placeholder":"Добавить участников","owner":"владелец","visible":"Группа видима всем пользователям","title":{"one":"группа","few":"группы","many":"групп","other":"групп"},"members":"Участники","posts":"Сообщения","alias_levels":{"title":"Кто может использовать данную группу как псевдоним?","nobody":"Никто","only_admins":"Только администраторы","mods_and_admins":"Только модераторы и администраторы","members_mods_and_admins":"Только члены группы, модераторы и администраторы","everyone":"Все"},"trust_levels":{"title":"Уровень доверия участника при создании:","none":"(Нет)"}},"user_action_groups":{"1":"Выразил симпатий","2":"Получил симпатий","3":"Закладки","4":"Темы","5":"Сообщения","6":"Ответы","7":"Упоминания","9":"Цитаты","10":"Избранное","11":"Изменения","12":"Отправленные","13":"Входящие","14":"Ожидает одобрения"},"categories":{"all":"Все разделы","all_subcategories":"Все подкатегории","no_subcategory":"Вне подкатегорий","category":"Раздел","reorder":{"title":"Упорядочивание разделов","title_long":"Реорганизация списка разделов","fix_order":"Зафиксировать порядковые номера","fix_order_tooltip":"Не всем разделам назначен уникальный порядковый номер. Это может привести к непредсказуемому порядку разделов.","save":"Сохранить порядок","apply_all":"Применить","position":"Порядковый номер"},"posts":"Сообщения","topics":"Темы","latest":"Последние","latest_by":"последние по","toggle_ordering":"изменить сортировку","subcategories":"Подразделы","topic_stats":"Количество новых тем.","topic_stat_sentence":{"one":"%{count} новая тема за предыдущий %{unit}.","few":"%{count} новые темы за предыдущий %{unit}.","many":"%{count} новых тем за предыдущий %{unit}.","other":"%{count} новых тем за предыдущий %{unit}."},"post_stats":"Количество новых сообщений.","post_stat_sentence":{"one":"%{count} новое сообщение за предыдущий %{unit}.","few":"%{count} новых сообщения за предыдущий %{unit}.","many":"%{count} новых сообщений за предыдущий %{unit}.","other":"%{count} новых сообщений за предыдущий %{unit}."}},"ip_lookup":{"title":"Поиск IP адреса","hostname":"Название хоста","location":"Расположение","location_not_found":"(неизвестно)","organisation":"Организация","phone":"Телефон","other_accounts":"Другие учетные записи с этим IP адресом","delete_other_accounts":"Удалить %{count}","username":"псевдоним","trust_level":"Уровень","read_time":"время чтения","topics_entered":"посещено тем","post_count":"сообщений","confirm_delete_other_accounts":"Вы уверены, что хотите удалить эти учетные записи?"},"user_fields":{"none":"(выберите)"},"user":{"said":"{{username}}:","profile":"Профиль","mute":"Отключить","edit":"Настройки","download_archive":"Скачать архив сообщений","new_private_message":"Новое сообщение","private_message":"Сообщение","private_messages":"Личные сообщения","activity_stream":"Активность","preferences":"Настройки","expand_profile":"Развернуть","bookmarks":"Закладки","bio":"Обо мне","invited_by":"Пригласил","trust_level":"Уровень","notifications":"Уведомления","desktop_notifications":{"label":"Оповещения","not_supported":"К сожалению, оповещения не поддерживаются этим браузером.","perm_default":"Включить оповещения","perm_denied_btn":"Отказано в разрешении","perm_denied_expl":"Вы запретили оповещения в вашем браузере. Вначале возобновите разрешение, а затем попробуйте еще раз.","disable":"Отключить оповещения","currently_enabled":"(сейчас включены)","enable":"Включить оповещения","currently_disabled":"(сейчас отключены)","each_browser_note":"Примечание: эта настройка устанавливается в каждом браузере индивидуально."},"dismiss_notifications":"Пометить все прочитанными","dismiss_notifications_tooltip":"Пометить все непрочитанные уведомления прочитанными","disable_jump_reply":"Не переходить к вашему новому сообщению после ответа","dynamic_favicon":"Показывать колличество новых / обновленных тем на иконке сообщений","edit_history_public":"Разрешить другим пользователям просматривать мои редакции сообщения","external_links_in_new_tab":"Открывать все внешние ссылки в новой вкладке","enable_quoting":"Позволить отвечать с цитированием выделенного текста","change":"изменить","moderator":"{{user}} - модератор","admin":"{{user}} - админ","moderator_tooltip":"{{user}} - модератор","admin_tooltip":"{{user}} - админ","blocked_tooltip":"Этот пользователь заблокирован","suspended_notice":"Пользователь заморожен до {{date}}.","suspended_reason":"Причина:","github_profile":"Github","mailing_list_mode":"Получать письмо каждый раз, когда появляется новое сообщение (кроме тех случаев, когда тема или раздел отключены)","watched_categories":"Наблюдение","watched_categories_instructions":"Вы будете автоматически отслеживать все новые темы в этих разделах. Вам будут приходить уведомления о новых сообщениях и темах, плюс рядом со списком тем будет отображено количество  новых сообщений.","tracked_categories":"Отслеживаемые разделы","tracked_categories_instructions":"Автоматически следить за всеми новыми темами из следующих разделов. Счетчик новых и непрочитанных сообщений будет появляться рядом с названием темы.","muted_categories":"Выключенные разделы","muted_categories_instructions":"Не уведомлять меня о новых темах в этих разделах и не показывать новые темы на странице «Непрочитанные».","delete_account":"Удалить мою учётную запись","delete_account_confirm":"Вы уверены, что хотите удалить свою учётную запись? Отменить удаление будет невозможно!","deleted_yourself":"Ваша учётная запись была успешно удалена.","delete_yourself_not_allowed":"Вы не можете сейчас удалить свою учётную запись. Попросите администратора удалить вашу учётную запись.","unread_message_count":"Сообщения","admin_delete":"Удалить","users":"Пользователи","muted_users":"Выключено","muted_users_instructions":"Не отображать уведомления от этих пользователей.","muted_topics_link":"Показать темы \"Без уведомлений\"","automatically_unpin_topics":"Автоматически откреплять топики после прочтения","staff_counters":{"flags_given":"полезные жалобы","flagged_posts":"сообщения с жалобами","deleted_posts":"удаленные сообщения","suspensions":"приостановки","warnings_received":"предупреждения"},"messages":{"all":"Все","mine":"Мои","unread":"Непрочитанные"},"change_password":{"success":"(письмо отправлено)","in_progress":"(отправка письма)","error":"(ошибка)","action":"Отправить письмо для сброса пароля","set_password":"Установить пароль"},"change_about":{"title":"Изменить информацию обо мне","error":"При изменении значения произошла ошибка."},"change_username":{"title":"Изменить псевдоним","confirm":"Если вы измените свой псевдоним, то все существующие цитаты ваших сообщений и упоминания вас по @псевдониму в чужих сообщениях перестанут ссылаться на вас. Вы точно хотите изменить псевадоним?","taken":"Этот псевдоним уже занят.","error":"При изменении псевдонима произошла ошибка.","invalid":"Псевдоним должен состоять только из цифр и латинских букв"},"change_email":{"title":"Изменить E-mail","taken":"Этот e-mail недоступен.","error":"Произошла ошибка. Возможно, этот e-mail уже используется?","success":"На указанныю почту отправлено письмо с инструкциями."},"change_avatar":{"title":"Изменить фон профиля","gravatar":"На основе \u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e","gravatar_title":"Измените свой аватар на сайте Gravatar","refresh_gravatar_title":"Обновить ваш Gravatar","letter_based":"Фон профиля по умолчанию","uploaded_avatar":"Собственный аватар","uploaded_avatar_empty":"Добавить собственный аватар","upload_title":"Загрузка собственного аватара","upload_picture":"Загрузить изображение","image_is_not_a_square":"Внимание: мы обрезали ваше изображение; ширина и высота не равны друг другу.","cache_notice":"Вы изменили аватар. Аватар поменяется через некоторое время из-за кеширования браузера."},"change_profile_background":{"title":"Фон профиля","instructions":"Картинки фона профилей будут отцентрированы и по-умолчанию имеют ширину 850 пикселей."},"change_card_background":{"title":"Фон карточки пользователя","instructions":"Картинки фона будут отцентрированы и по-умолчанию имеют ширину 590 пикселей."},"email":{"title":"E-mail","instructions":"Всегда скрыт от публики","ok":"Мы вышлем вам письмо для подтверждения","invalid":"Введите действующий адрес электронной почты","authenticated":"Ваш адрес электронной почты подтвержден {{provider}}","frequency":{"one":"Мы отправим вам письмо только в том случае, если вы более минуты находитесь оффлайн.","few":"Мы отправим вам письмо только в том случае, если вы не были онлайн последние {{count}} минуты.","many":"Мы отправим вам письмо только в том случае, если вы не были онлайн последние {{count}} минут.","other":"Мы отправим вам письмо только в том случае, если вы не были онлайн последние {{count}} минyт."}},"name":{"title":"Имя","instructions":"Ваше полное имя (опционально)","instructions_required":"Ваше полное имя","too_short":"Ваше имя слишком короткое","ok":"Допустимое имя"},"username":{"title":"Псевдоним","instructions":"Уникальный, без пробелов и покороче","short_instructions":"Пользователи могут упоминать вас по псевдониму @{{username}}","available":"Псевдоним доступен","global_match":"Адрес электронной почты совпадает с зарегистрированным псевдонимом","global_mismatch":"Уже занято. Попробуйте {{suggestion}}?","not_available":"Недоступно. Попробуйте {{suggestion}}?","too_short":"Псевдоним слишком короткий","too_long":"Псевдоним слишком длинный","checking":"Проверяю доступность псевдонима...","enter_email":"Псевдоним найден; введите адрес электронной почты","prefilled":"Адрес электронной почты совпадает с зарегистрированным псевдонимом"},"locale":{"title":"Язык интерфейса","instructions":"Язык сайта. Необходимо перезагрузить страницу, чтобы изменения вступили в силу.","default":"(по умолчанию)"},"password_confirmation":{"title":"Пароль еще раз"},"last_posted":"Последнее сообщение","last_emailed":"Последнее письмо","last_seen":"Был","created":"Вступил","log_out":"Выйти","location":"Местоположение","card_badge":{"title":"Иконка карточки пользователя"},"website":"Веб-сайт","email_settings":"E-mail","email_digests":{"title":"В случае моего отсутствия на форуме присылайте мне сводку новостей по почте:","daily":"ежедневно","every_three_days":"каждые 3 дня","weekly":"еженедельно","every_two_weeks":"каждые 2 недели"},"email_direct":"Присылать почтовое уведомление, когда кто-то цитирует меня, отвечает на мой пост, упоминает мой @псевдоним или приглашает меня в тему","email_private_messages":"Присылать почтовое уведомление, когда кто-то оставляет мне сообщение","email_always":"Присылать почтовое уведомление, даже если я присутствую на сайте","other_settings":"Прочее","categories_settings":"Разделы","new_topic_duration":{"label":"Считать темы новыми, если","not_viewed":"ещё не просмотрены","last_here":"созданы после вашего последнего визита","after_1_day":"созданы за прошедший день","after_2_days":"созданы за последние 2 дня","after_1_week":"созданы за последнюю неделю","after_2_weeks":"созданы за последние 2 недели"},"auto_track_topics":"Автоматически отслеживать темы, которые я просматриваю","auto_track_options":{"never":"никогда","immediately":"немедленно","after_30_seconds":"более 30 секунд","after_1_minute":"более 1ой минуты","after_2_minutes":"более 2х минут","after_3_minutes":"более 3х минут","after_4_minutes":"более 4х минут","after_5_minutes":"более 5 минут","after_10_minutes":"более 10 минут"},"invited":{"search":"Введите текст для поиска по приглашениям...","title":"Приглашения","user":"Кто приглашен","sent":"Когда","none":"Приглашения, ожидающие одобрения, отсутствуют.","truncated":{"one":"Первое приглашение","few":"Первые {{count}} приглашений","many":"Первые {{count}} приглашений","other":"Первые {{count}} приглашений"},"redeemed":"Принятые приглашения","redeemed_tab":"Принятые","redeemed_tab_with_count":"Принятые ({{count}})","redeemed_at":"Принято","pending":"Еще не принятые приглашения","pending_tab":"Ожидающие","pending_tab_with_count":"Ожидающие ({{count}})","topics_entered":"Просмотрел тем","posts_read_count":"Прочитал сообщений","expired":"Это приглашение истекло.","rescind":"Отозвать","rescinded":"Приглашение отозвано","reinvite":"Повторить приглашение","reinvited":"Приглашение выслано повторно","time_read":"Времени читал","days_visited":"Дней посещал","account_age_days":"Дней с момента регистрации","create":"Отправить приглашение","generate_link":"Скопировать ссылку для приглашений","generated_link_message":"\u003cp\u003eПригласительная ссылка сгенерирована!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eЭта ссылка действует только для следующего e-mail:\u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Вы еще никого не приглашали на этот форум. Можно отправить индивидуальные приглашения по одному, или же пригласить сразу несколько людей \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eиз файла\u003c/a\u003e.","text":"Пригласить всех из файла","uploading":"Загрузка...","success":"Файл успешно загружен, вы получите сообщение, когда процесс будет завершен.","error":"В процессе загрузки файла '{{filename}}' произошла ошибка: {{message}}"}},"password":{"title":"Пароль","too_short":"Пароль слишком короткий.","common":"Пароль слишком короткий.","same_as_username":"Ваш пароль такой же, как и ваше имя пользователя.","same_as_email":"Ваш пароль такой же, как и ваш email.","ok":"Допустимый пароль.","instructions":"Не менее %{count} символов."},"associated_accounts":"Связанные аккаунты","ip_address":{"title":"Последний IP адрес"},"registration_ip_address":{"title":"IP адрес регистрации"},"avatar":{"title":"Аватар","header_title":"профиль, сообщения, закладки и настройки"},"title":{"title":"Заголовок"},"filters":{"all":"Всего"},"stream":{"posted_by":"Опубликовано","sent_by":"Отправлено","private_message":"сообщение","the_topic":"тема"}},"loading":"Загрузка...","errors":{"prev_page":"при попытке загрузки","reasons":{"network":"Ошибка сети","server":"Ошибка сервера","forbidden":"Доступ закрыт","unknown":"Ошибка","not_found":"Страница не найдена"},"desc":{"network":"Пожалуйста, проверьте ваше соединение.","network_fixed":"Похоже, сеть появилась.","server":"Ошибка: {{status}}","forbidden":"У вас нет доступа для просмотра этого.","not_found":"Упс, произошла попытка загрузить несуществующую ссылку","unknown":"Что-то пошло не так."},"buttons":{"back":"Вернуться","again":"Попытаться еще раз","fixed":"Загрузить страницу"}},"close":"Закрыть","assets_changed_confirm":"Сайт только что был обновлен. Перезагрузить страницу для перехода к новой версии?","logout":"Вы вышли.","refresh":"Обновить","read_only_mode":{"enabled":"Администратор включил режим сайта ТОЛЬКО ДЛЯ ЧТЕНИЯ. Вы можете продолжать просматривать сайт. В данном режиме Ваши посты не будут сохранятся и публиковаться на сайте.","login_disabled":"Вход отключён, пока сайт в режиме «только для чтения»"},"learn_more":"подробнее...","year":"год","year_desc":"темы, созданные за последние 365 дней","month":"месяц","month_desc":"темы, созданные за последние 30 дней","week":"неделя","week_desc":"темы, созданные за последние 7 дней","day":"день","first_post":"Первое сообщение","mute":"Отключить","unmute":"Включить","last_post":"Последнее сообщение","last_reply_lowercase":"последний ответ","replies_lowercase":{"one":"ответ","few":"ответа","other":"ответов"},"signup_cta":{"sign_up":"Зарегистрироваться","hide_session":"Напомнить мне завтра","hide_forever":"Нет, спасибо","hidden_for_session":"Хорошо, напомню завтра. Кстати, зарегистрироваться можно также и с помощью кнопки \"Войти\".","intro":"Привет! :heart_eyes: Кажется, форум пришелся вам по душе, но вы все еще не зарегистрировались.","value_prop":"После регистрации мы сможем запоминать, где вы закончили чтение, а когда вы заглянете в ту или иную тему снова, мы откроем ее там, где вы остановились в прошлый раз. Мы также сможем уведомлять вас о новых ответах в любимых темах в вашем личном кабинете или по электронной почте. А самое приятное - после регистрации можно ставить сердечки, тем самым выражая свою симпатию автору. :heartbeat:"},"summary":{"enabled_description":"Вы просматриваете выдержку из темы - только самые интересные сообщения по мнению сообщества.","description":"Есть \u003cb\u003e{{count}}\u003c/b\u003e ответ(ов).","description_time":"В теме \u003cb\u003e{{count}}\u003c/b\u003e сообщений с ожидаемым временем чтения \u003cb\u003e{{readingTime}} минут\u003c/b\u003e.","enable":"Сводка по теме","disable":"Показать все сообщения"},"deleted_filter":{"enabled_description":"Этам тема содержит удаленные сообщения, которые сейчас скрыты.","disabled_description":"Удаленные сообщения темы показаны.","enable":"Скрыть удаленные сообщения","disable":"Показать удаленные сообщения"},"private_message_info":{"title":"Сообщение","invite":"Пригласить других...","remove_allowed_user":"Вы действительно хотите удалить {{name}} из данного сообщения?"},"email":"Email","username":"Псевдоним","last_seen":"Был","created":"Создан","created_lowercase":"создано","trust_level":"Уровень доверия","search_hint":"Псевдоним, e-mail или IP адрес","create_account":{"title":"Зарегистрироваться","failed":"Произошла ошибка. Возможно, этот Email уже используется. Попробуйте восстановить пароль"},"forgot_password":{"title":"Сброс пароля","action":"Я забыл свой пароль","invite":"Введите ваш псевдоним или адрес электронной почты, и мы отправим вам ссылку для сброса пароля.","reset":"Сброс пароля","complete_username":"Если учетная запись совпадает с псевдонимом \u003cb\u003e%{username}\u003c/b\u003e, вы скоро получите письмо с инструкциями о том, как сбросить пароль.","complete_email":"Если учетная запись совпадает с \u003cb\u003e%{email}\u003c/b\u003e, вы должны получить письмо с инструкциями о том, как быстро сбросить ваш пароль.","complete_username_found":"Мы нашли учетную запись с псевдонимом \u003cb\u003e%{username}\u003c/b\u003e и выслали вам на e-mail инструкции по сбросу пароля.","complete_email_found":"Мы нашли учетную запись с адресом электронной почты  \u003cb\u003e%{email}\u003c/b\u003e и выслали туда инструкцию по сбросу пароля.","complete_username_not_found":"Не найдено учетной записи с псевдонимом \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Не найдено учетной записи с адресом электронной почты \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Войти","username":"Пользователь","password":"Пароль","email_placeholder":"E-mail или псевдоним","caps_lock_warning":"Caps Lock включен","error":"Непредвиденная ошибка","rate_limit":"Пожалуйста, сделайте перерыв перед очередной попыткой войти.","blank_username_or_password":"Введите ваш e-mail (или псевдоним) и пароль.","reset_password":"Сброс пароля","logging_in":"Проверка...","or":"или","authenticating":"Проверка...","awaiting_confirmation":"Ваша учетная запись требует активации. Для того, чтобы получить активационное письмо повторно, нажмите на Сброс пароля.","awaiting_approval":"Ваша учетная запись еще не одобрена. Вы получите письмо, как только это случится.","requires_invite":"К сожалению, доступ к этому форуму только по приглашениям.","not_activated":"Прежде, чем вы сможете войти на форум, вам необходимо активировать свою учетную запись. Мы отправили на почту \u003cb\u003e{{sentTo}}\u003c/b\u003e подробные инструкции, как это cделать.","not_allowed_from_ip_address":"С этого IP адреса вход запрещен.","admin_not_allowed_from_ip_address":"Вы не можете войти в качестве админа с этого IP адреса.","resend_activation_email":"Щелкните здесь, чтобы мы повторно выслали вам письмо для активации учетной записи.","sent_activation_email_again":"По адресу \u003cb\u003e{{currentEmail}}\u003c/b\u003e повторно отправлено письмо с инструкциями по активации вашей учетной записи. Доставка сообщения может занять несколько минут. Имейте в виду, что иногда по ошибке письмо может попасть в папку Спам.","to_continue":"Войдите пожалуйста","preferences":"Вам необходимо войти на сайт для редактирования настроек пользователя","forgot":"Я не помню данные моего аккаунта","google":{"title":"С помощью Google","message":"Вход с помощью учетной записи Google (убедитесь, что блокировщик всплывающих окон отключен)"},"google_oauth2":{"title":"С помощью Google","message":"Вход с помощью учетной записи Google (убедитесь, что блокировщик всплывающих окон отключен)"},"twitter":{"title":"С помощью Twitter","message":"Вход с помощью учетной записи Twitter (убедитесь, что блокировщик всплывающих окон отключен)"},"facebook":{"title":"С помощью Facebook","message":"Вход с помощью учетной записи Facebook (всплывающие окна должны быть разрешены)"},"yahoo":{"title":"С помощью Yahoo","message":"Вход с помощью учетной записи Yahoo (убедитесь, что блокировщик всплывающих окон отключен)"},"github":{"title":"С помощью GitHub","message":"Вход с помощью учетной записи GitHub (убедитесь, что блокировщик всплывающих окон отключен)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"подробнее...","options":"Опции","whisper":"внутреннее сообщение","add_warning":"Это официальное предупреждение.","toggle_whisper":"Внутреннее сообщение","posting_not_on_topic":"В какой теме вы хотите ответить?","saving_draft_tip":"Сохранение...","saved_draft_tip":"сохранено","saved_local_draft_tip":"сохранено локально","similar_topics":"Ваша тема похожа на...","drafts_offline":"Сохраненные черновики","error":{"title_missing":"Требуется заголовок","title_too_short":"Заголовок должен быть не менее {{min}} символов","title_too_long":"Заголовок не может быть длиннее {{max}} символов","post_missing":"Сообщение не может быть пустым","post_length":"Сообщение должно содержать минимум {{min}} символов","try_like":"А вы пробовали лайкнуть сообщение с помощью кнопки \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e ?","category_missing":"Нужно выбрать раздел"},"save_edit":"Сохранить","reply_original":"Ответ в первоначальной теме","reply_here":"Ответить в текущей теме","reply":"Ответить","cancel":"Отменить","create_topic":"Создать тему","create_pm":"Сообщение","title":"Или нажмите Ctrl+Enter","users_placeholder":"Добавить пользователя","title_placeholder":"Название: суть обсуждения коротким предложением","edit_reason_placeholder":"почему вы хотите изменить?","show_edit_reason":"(добавить причину редактирования)","reply_placeholder":"Поддерживаемые форматы: Markdown, BBCode или HTML. Для добавления изображений перетащите их","view_new_post":"Посмотреть созданное вами сообщение.","saving":"Сохранение","saved":"Сохранено!","saved_draft":"Черновик сообщения. Нажмите, чтобы продолжить редактирование.","uploading":"Загрузка...","show_preview":"предпросмотр \u0026raquo;","hide_preview":"\u0026laquo; скрыть предпросмотр","quote_post_title":"Процитировать всё сообщение","bold_title":"Выделение жирным","bold_text":"текст, выделенный жирным","italic_title":"Выделение курсивом","italic_text":"текст, выделенный курсивом","link_title":"Ссылка","link_description":"введите описание ссылки","link_dialog_title":"Вставить ссылку","link_optional_text":"необязательное название","link_placeholder":"http://example.com \"необязательное название\"","quote_title":"Цитата","quote_text":"Цитата","code_title":"Форматированный текст","code_text":"добавьте 4 символа пробела, перед форматированным текстом","upload_title":"Загрузить","upload_description":"введите здесь описание загружаемого объекта","olist_title":"Нумерованный список","ulist_title":"Маркированный список","list_item":"Элемент списка","heading_title":"Заголовок","heading_text":"Заголовок","hr_title":"Горизонтальный разделитель","help":"Справка по Markdown","toggler":"скрыть / показать панель редактирования","modal_ok":"OK","modal_cancel":"Отмена","cant_send_pm":"Извините, но вы не можете отправлять сообщения пользователю %{username}.","admin_options_title":"Дополнительные настройки темы","auto_close":{"label":"Закрыть тему через:","error":"Пожалуйста, введите корректное значение.","based_on_last_post":"Не закрывать, пока не пройдет хотя бы такой промежуток времени с момента последнего сообщения в этой теме.","all":{"examples":"Введите количество часов (24), абсолютное время (17:30), или дату и время (2013-11-22 14:00)."},"limited":{"units":"(кол-во часов)","examples":"Введите количество часов (24)."}}},"notifications":{"title":"уведомления об упоминании @псевдонима, ответах на ваши посты и темы, сообщения и т.д.","none":"Уведомления не могут быть загружены.","more":"посмотреть более ранние уведомления","total_flagged":"всего сообщений с жалобами","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='приглашен в тему' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e принял(а) ваше приглашение\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e переместил(а) {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eВы награждены: {{description}}\u003c/p\u003e","alt":{"quoted":"Процитировано пользователем","replied":"Ответил","edited":"Изменил ваше сообщение","liked":"Понравилось ваше сообщение","private_message":"Личное сообщение от","invitee_accepted":"Приглашение принято","linked":"Ссылка на ваше сообщение"},"popup":{"mentioned":"{{username}} упомянул вас в \"{{topic}}\" - {{site_title}}","quoted":"{{username}} процитировал Вас в \"{{topic}}\" - {{site_title}}","replied":"{{username}} ответил вам в \"{{topic}}\" - {{site_title}}","posted":"{{username}} написал в \"{{topic}}\" - {{site_title}}","private_message":"{{username}} отправил вам личное сообщение в \"{{topic}}\" - {{site_title}}","linked":"{{username}} ссылается на ваш пост в теме: \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Add an image","title_with_attachments":"Add an image or a file","from_my_computer":"From my device","from_the_web":"From the web","remote_tip":"ссылка на изображение","local_tip":"выбрать изображения с вашего устройства","local_tip_with_attachments":"выбрать изображения или файлы с вашего устройства {{authorized_extensions}}","hint":"(вы так же можете перетащить объект в редактор для его загрузки)","hint_for_supported_browsers":"вы так же можете перетащить или скопировать изображения в редактор","uploading":"Загрузка","select_file":"Выбрать файл","image_link":"ссылка, на которую будет указывать ваше изображение"},"search":{"sort_by":"Сортировка","relevance":"По смыслу","latest_post":"С недавними сообщениями","most_viewed":"Самые просматриваемые","most_liked":"Больше всего симпатий","select_all":"Выбрать все","clear_all":"Сбросить все","result_count":{"one":"Найдено 1: \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","few":"Найдено {{count}}: \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","many":"Найдено {{count}}: \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"Найдено {{count}}: \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"Поиск по темам, сообщениям, псевдонимам и разделам","no_results":"Ничего не найдено.","no_more_results":"Больше ничего не найдено.","search_help":"Справка по поиску","searching":"Поиск ...","post_format":"#{{post_number}} от {{username}}","context":{"user":"Искать сообщения от @{{username}}","category":"Искать в разделе \"{{category}}\"","topic":"Искать в этой теме","private_messages":"Искать в личных сообщениях"}},"hamburger_menu":"перейти к другому списку тем или другому разделу","new_item":"новый","go_back":"вернуться","not_logged_in_user":"страница пользователя с историей его последней активности и настроек","current_user":"перейти на вашу страницу пользователя","topics":{"bulk":{"reset_read":"Сбросить прочтённые","delete":"Удалить темы","dismiss":"OK","dismiss_read":"Отклонить все непрочитанные","dismiss_button":"Отложить...","dismiss_tooltip":"Отложить новые сообщения или перестать следить за этими темами","dismiss_new":"Отложить новые","toggle":"Вкл./выкл. выбор нескольких тем","actions":"Массовое действие","change_category":"Изменить раздел","close_topics":"Закрыть темы","archive_topics":"Архивировать темы","notification_level":"Изменить уровень оповещения","choose_new_category":"Выберите новый раздел для тем:","selected":{"one":"Вы выбрали \u003cb\u003e1\u003c/b\u003e тему.","few":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e темы.","many":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e тем.","other":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e тем."}},"none":{"unread":"У вас нет непрочитанных тем.","new":"У вас нет новых тем.","read":"Вы еще не прочитали ни одной темы.","posted":"Вы не принимали участие в обсуждении.","latest":"Новых тем нет.","hot":"Популярных тем нет.","bookmarks":"У вас нет избранных тем.","category":"В разделе {{category}} отсутствуют темы.","top":"Нет обсуждаемых тем.","search":"Ничего не найдено.","educate":{"new":"\u003cp\u003eЭто список новых тем.\u003c/p\u003e\u003cp\u003eПо-умолчанию, тема считается новой и отображается с индикатором \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eновое\u003c/span\u003e, если она была создана в течении последних 2-х дней. \u003c/p\u003e\u003cp\u003eЭто можно изменить в своих \u003ca href=\"%{userPrefsUrl}\"\u003eнастройках\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eЭто ваш список непрочитанных тем.\u003c/p\u003e\u003cp\u003eПо-умолчанию, темы считаются непрочитанными и напротив них отображается счетчик непрочитанных сообщений \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e, если вы:\u003c/p\u003e\u003cul\u003e\u003cli\u003eсоздали тему;\u003c/li\u003e\u003cli\u003eответили в теме;\u003c/li\u003e\u003cli\u003eчитали тему более 4-х минут.\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eИли же если вы намеренно выбрали Следить или Наблюдать в настройках уведомлений в самом низу темы.\u003c/p\u003e\u003cp\u003eЭту функциональность можно дополнительно отрегулировать в ваших \u003ca href=\"%{userPrefsUrl}\"\u003eнастройках\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Тем больше нет.","hot":"Популярных тем больше нет.","posted":"Созданных тем больше нет.","read":"Прочитанных тем больше нет.","new":"Больше нет новых тем.","unread":"Больше нет непрочитанных тем.","category":"В разделе {{category}} больше нет тем.","top":"Больше нет обсуждаемых тем.","bookmarks":"Больше нет избранных тем.","search":"Больше ничего не найдено."}},"topic":{"unsubscribe":{"change_notification_state":"Ваше текущее состояние уведомлений"},"filter_to":"{{post_count}} сообщений в теме","create":"Создать Тему","create_long":"Создать новую тему","private_message":"Написать сообщение","list":"Темы","new":"новая тема","unread":"непрочитанно","new_topics":{"one":"1 новая тема","few":"{{count}} новых темы","many":"{{count}} новых тем","other":"{{count}} новых тем"},"unread_topics":{"one":"1 непрочитанная тема","few":"{{count}} непрочитанные темы","many":"{{count}} непрочитанных тем","other":"{{count}} непрочитанных тем"},"title":"Тема","invalid_access":{"title":"Частная тема","description":"К сожалению, у вас нет прав доступа к теме!","login_required":"Вам необходимо войти на сайт, чтобы получить доступ к этой теме."},"server_error":{"title":"Не удалось загрузить тему","description":"К сожалению, мы не смогли загрузить тему, возможно, из-за проблемы подключения. Попробуйте еще раз. Если проблема повторится, пожалуйста, сообщите нам об этом."},"not_found":{"title":"Тема не найдена","description":"К сожалению, запрошенная тема не найдена. Возможно, она была удалена модератором."},"total_unread_posts":{"one":"у вас 1 непрочитанное сообщение в этой теме","few":"у вас {{count}} непрочитанных сообщения в этой теме","many":"у вас {{count}} непрочитанных сообщения в этой теме","other":"у вас {{count}} непрочитанных сообщения в этой теме"},"unread_posts":{"one":"у вас 1 непрочитанное старое сообщение в этой теме","few":"у вас {{count}} непрочитанных старых сообщения в этой теме","many":"у вас {{count}} непрочитанных старых сообщений в этой теме","other":"у вас {{count}} непрочитанных старых сообщений в этой теме"},"new_posts":{"one":"в этой теме 1 новое сообщение с её последнего просмотра вами","few":"в этой теме {{count}} новых сообщения с её последнего просмотра вами","many":"в этой теме {{count}} новых сообщений с её последнего просмотра вами","other":"в этой теме {{count}} новых сообщений с её последнего просмотра вами"},"likes":{"one":"в теме 1 лайк","few":"в теме {{count}} лайка","many":"в теме {{count}} лайков","other":"в теме {{count}} лайков"},"back_to_list":"Вернуться к списку тем","options":"Опции темы","show_links":"показать ссылки в теме","toggle_information":"скрыть / показать подробную информацию о теме","read_more_in_category":"Хотите почитать что-нибудь еще? Можно посмотреть темы в {{catLink}} или {{latestLink}}.","read_more":"Хотите почитать что-нибудь еще? {{catLink}} или {{latestLink}}.","browse_all_categories":"Просмотреть все разделы","view_latest_topics":"посмотреть последние темы","suggest_create_topic":"Почему бы вам не создать новую тему?","jump_reply_up":"перейти к более ранним ответам","jump_reply_down":"перейти к более поздним ответам","deleted":"Тема удалена","auto_close_notice":"Тема будет автоматически закрыта через %{timeLeft}.","auto_close_notice_based_on_last_post":"Эта тема будет закрыта через %{duration} после последнего ответа.","auto_close_title":"Настройки закрытия темы","auto_close_save":"Сохранить","auto_close_remove":"Не закрывать тему автоматически","progress":{"title":"текущее местоположение в теме","go_top":"перейти наверх","go_bottom":"перейти вниз","go":"=\u003e","jump_bottom":"перейти к последнему сообщению","jump_bottom_with_number":"перейти к сообщению %{post_number}","total":"всего сообщений","current":"текущее сообщение","position":"%{current} сообщение из %{total}"},"notifications":{"reasons":{"3_6":"Вы будете получать уведомления, т.к. наблюдаете за этим разделом.","3_5":"Вы будете получать уведомления, т.к. наблюдение темы началось автоматически.","3_2":"Вы будете получать уведомления, т.к. наблюдаете за этой темой.","3_1":"Вы будете получать уведомления, т.к. создали эту тему.","3":"Вы будете получать уведомления, т.к. наблюдаете за темой.","2_8":"Вы будете получать уведомления, т.к. следите за этим разделом.","2_4":"Вы будете получать уведомления, т.к. ответили в теме.","2_2":"Вы будете получать уведомления, т.к. следите за этой темой.","2":"Вы будете получать уведомления, т.к. \u003ca href=\"/users/{{username}}/preferences\"\u003eчитали эту тему\u003c/a\u003e.","1_2":"Вы будете получать уведомления, если кто-то упомянет ваш @псевдоним или ответит вам.","1":"Вы будете получать уведомления, если кто-то упомянет ваш @псевдоним или ответит вам.","0_7":"Не получать уведомлений из этого раздела.","0_2":"Не получать уведомлений по этой теме.","0":"Не получать уведомлений по этой теме."},"watching_pm":{"title":"Наблюдать","description":"Уведомлять по каждому ответу на это сообщение и показывать счетчик новых непрочитанных ответов."},"watching":{"title":"Наблюдать","description":"Уведомлять по каждому новому сообщению в этой теме и показывать счетчик новых непрочитанных ответов."},"tracking_pm":{"title":"Следить","description":"Количество непрочитанных сообщений появится рядом с этим сообщением. Вам придёт уведомление, только если кто-нибудь упомянет ваш @псевдоним или ответит на ваше сообщение."},"tracking":{"title":"Следить","description":"Количество непрочитанных сообщений появится рядом с названием этой темы. Вам придёт уведомление, только если кто-нибудь упомянет ваш @псевдоним или ответит на ваше сообщение."},"regular":{"title":"Уведомлять","description":"Вам придёт уведомление, только если кто-нибудь упомянет ваш @псевдоним или ответит на ваше сообщение."},"regular_pm":{"title":"Уведомлять","description":"Вам придёт уведомление, только если кто-нибудь упомянет ваш @псевдоним или ответит на ваше сообщение."},"muted_pm":{"title":"Без уведомлений","description":"Никогда не получать уведомлений, связанных с этой беседой."},"muted":{"title":"Без уведомлений","description":"Не уведомлять об изменениях в этой теме и скрыть её из последних."}},"actions":{"recover":"Отменить удаление темы","delete":"Удалить тему","open":"Открыть тему","close":"Закрыть тему","multi_select":"Выбрать сообщения...","auto_close":"Автоматическое закрытие...","pin":"Закрепить тему...","unpin":"Открепить тему...","unarchive":"Разархивировать тему","archive":"Архивировать тему","invisible":"Исключить из списков","visible":"Включить в списки","reset_read":"Сбросить счетчики"},"feature":{"pin":"Закрепить тему","unpin":"Открепить тему","pin_globally":"Закрепить тему глобально","make_banner":"Создать объявление","remove_banner":"Удалить объявление"},"reply":{"title":"Ответить","help":"ответить в теме"},"clear_pin":{"title":"Открепить","help":"Открепить тему, чтобы она более не показывалась в самом начале списка тем"},"share":{"title":"Поделиться","help":"Поделиться ссылкой на тему"},"flag_topic":{"title":"Жалоба","help":"пожаловаться на сообщение","success_message":"Вы пожаловались на тему."},"feature_topic":{"title":"Выделить эту тему","confirm_pin":"У вас уже есть {{count}} закрепленных тем. Слишком большое количество закрепленных тем может стать препятствием для новых и анонимных пользователей. Вы уверены, что хотите закрепить еще одну тему в этом разделе?","unpin":"Убрать эту тему из верха раздела {{categoryLink}}.","pin_note":"Пользователи могут открепить тему для себя.","pin_validation":"Дата необходима, чтобы прикрепить эту тему","not_pinned":"В разделе {{categoryLink}} нет закрепленных тем.","confirm_pin_globally":"У вас уже есть {{count}} глобально закрепленных тем. Слишком большое количество закрепленных тем может стать препятствием для новых и анонимных пользователей. Вы уверены, что хотите глобально закрепить еще одну тему?","unpin_globally":"Убарть эту тему из верха всех списков тем.","unpin_globally_until":"Убарть эту тему из верха всех списков тем.","global_pin_note":"Пользователи могут открепить тему для себя.","not_pinned_globally":"Нет глобально закрепленных тем.","make_banner":"Превратить эту тему в объявление, которое будет отображаться вверху всех страниц.","remove_banner":"Убрать объявление, которое отображается вверху всех страниц.","banner_note":"Пользователи могут отклонить объявление, закрыв его. Только одну тему можно сделать текущим объявлением.","no_banner_exists":"Нет текущих объявлений."},"inviting":"Высылаю приглашение...","automatically_add_to_groups_optional":"Это приглашение также включает в себя доступ к следующим группам: (опционально, только для администратора)","automatically_add_to_groups_required":"Это приглашение также включает в себя доступ к следующим группам: (\u003cb\u003eОбязательно\u003c/b\u003e, только для администратора)","invite_private":{"title":"Пригласить в беседу","email_or_username":"Адрес электронной почты или псевдоним того, кого вы хотите пригласить","email_or_username_placeholder":"e-mail или псевдоним","action":"Пригласить","success":"Мы пригласили этого пользователя принять участие в беседе.","error":"К сожалению, в процессе приглашения пользователя произошла ошибка.","group_name":"название группы"},"invite_reply":{"title":"Пригласить","username_placeholder":"имя пользователя","action":"Отправить приглашение","help":"пригласить других в эту тему с помощью email или уведомлений","to_forum":"Будет отправлено короткое письмо, которое позволит вашему другу присоединиться просто кликнув по ссылке без необходимости входа на сайт.","sso_enabled":"Введите псевдоним пользователя, которого вы хотите пригласить в эту тему.","to_topic_blank":"Введите псевдоним или email пользователя, которого вы хотите пригласить в эту тему.","to_topic_email":"Вы указали адрес электронной почты. Мы отправим приглашение, которое позволит вашему другу немедленно ответить в этой теме.","to_topic_username":"Вы указали псевдоним пользователя. Мы отправим ему уведомление со ссылкой, чтобы пригласить его в эту тему.","to_username":"Введите псевдоним пользователя, которого вы хотите пригласить в эту тему. Мы отправим ему уведомление о том что вы приглашаете его присоединиться к этой теме.","email_placeholder":"name@example.com","success_email":"Приглашение отправлено по адресу \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Мы уведомим Вас, когда этим приглашением воспользуются. Проверьте вкладку Приглашения на вашей странице пользователя, чтобы узнать состояние всех ваших приглашений.","success_username":"Мы пригласили этого пользователя принять участие в теме.","error":"К сожалению, мы не смогли пригласить этого человека. Возможно, он уже был приглашен? (Приглашения ограничены рейтингом)"},"login_reply":"Войти и ответить","filters":{"n_posts":{"one":"1 сообщение","few":"{{count}} сообщения","many":"{{count}} сообщений","other":"{{count}} сообщений"},"cancel":"Отменить фильтр"},"split_topic":{"title":"Переместить в новую тему","action":"переместить в новую тему","topic_name":"Название новой темы","error":"Во время перемещения сообщений в новую тему возникла ошибка.","instructions":{"one":"Сейчас вы создадите новую тему и в неё переместится выбранное вами сообщение.","few":"Сейчас вы создадите новую тему и в неё переместятся выбранные вами \u003cb\u003e{{count}}\u003c/b\u003e сообщения.","many":"Сейчас вы создадите новую тему и в неё переместятся выбранные вами \u003cb\u003e{{count}}\u003c/b\u003e сообщений.","other":"Сейчас вы создадите новую тему и в неё переместятся выбранные вами \u003cb\u003e{{count}}\u003c/b\u003e сообщений."}},"merge_topic":{"title":"Переместить в существующую тему","action":"переместить в существующую тему","error":"Во время перемещения сообщений в тему возникла ошибка.","instructions":{"one":"Пожалуйста, выберите тему, в которую вы хотели бы переместить это сообщение.","few":"Пожалуйста, выберите тему, в которую вы хотели бы переместить эти \u003cb\u003e{{count}}\u003c/b\u003e сообщения.","many":"Пожалуйста, выберите тему, в которую вы хотели бы переместить эти \u003cb\u003e{{count}}\u003c/b\u003e сообщений.","other":"Пожалуйста, выберите тему, в которую вы хотели бы переместить эти \u003cb\u003e{{count}}\u003c/b\u003e сообщений."}},"change_owner":{"title":"Изменить владельца сообщений","action":"изменить владельца","error":"При смене владельца сообщений произошла ошибка.","label":"Новый владелец сообщений","placeholder":"псевдоним нового владельца","instructions":{"one":"Пожалуйста, выберите нового владельца сообщения от \u003cb\u003e{{old_user}}\u003c/b\u003e.","few":"Пожалуйста, выберите нового владельца {{count}} сообщений от \u003cb\u003e{{old_user}}\u003c/b\u003e.","many":"Пожалуйста, выберите нового владельца {{count}} сообщений от \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Пожалуйста, выберите нового владельца {{count}} сообщений от \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Обратите внимание, что все уведомления об этом сообщении не будут переданы новому пользователю задним числом. \u003cbr\u003eВнимание: В настоящее время никакие данные, имеющие отношение к сообщению, не передаются новому пользователю. Используйте с осторожностью."},"change_timestamp":{"title":"Изменить временную метку","action":"изменить временную метку","invalid_timestamp":"Временная метка не может быть в будущем","error":"При изменении временной метки темы возникла ошибка","instructions":"Пожалуйста, выберите новую временную метку. Сообщения в теме будут обновлены, чтобы убрать временные различия."},"multi_select":{"select":"выбрать","selected":"выбрано ({{count}})","select_replies":"выбрать +ответы","delete":"удалить выбранные","cancel":"отменить выделение","select_all":"выбрать все","deselect_all":"снять весь выбор","description":{"one":"Вы выбрали \u003cb\u003e1\u003c/b\u003e сообщение.","few":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e сообщения.","many":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e сообщений.","other":"Вы выбрали \u003cb\u003e{{count}}\u003c/b\u003e сообщений."}}},"post":{"quote_reply":"ответить цитированием","edit":"Изменить {{link}} {{replyAvatar}} {{username}}","edit_reason":"Причина:","post_number":"сообщение {{number}}","last_edited_on":"последний раз сообщение редактировалось","reply_as_new_topic":"Ответить в новой связанной теме","continue_discussion":"Продолжить обсуждение из {{postLink}}:","follow_quote":"перейти к цитируемому сообщению","show_full":"Показать полный текст","show_hidden":"Отобразить скрытое содержимое.","deleted_by_author":{"one":"(сообщение отозвано автором и будет автоматически удалено в течение %{count} часа, если только на сообщение не поступит жалоба)","few":"(сообщение отозвано автором и будет автоматически удалено в течение %{count} часов, если только на сообщение не поступит жалоба)","many":"(сообщение отозвано автором и будет автоматически удалено в течение %{count} часов, если только на сообщение не поступит жалоба)","other":"(сообщение отозвано автором и будет автоматически удалено в течение %{count} часов, если только на сообщение не поступит жалоба)"},"expand_collapse":"развернуть/свернуть","gap":{"one":"просмотреть 1 скрытый ответ","few":"просмотреть {{count}} скрытых ответов","many":"просмотреть {{count}} скрытых ответов","other":"просмотреть {{count}} скрытых ответов"},"more_links":"еще {{count}}...","unread":"Сообщение не прочитано","has_replies":{"one":"{{count}} Ответ","few":"{{count}} Ответа","many":"{{count}} Ответов","other":"{{count}} Ответов"},"has_likes":{"one":"{{count}} симпатия","few":"{{count}} симпатии","many":"{{count}} симпатий","other":"{{count}} симпатий"},"has_likes_title":{"one":"Это сообщение понравилось {{count}} человеку","few":"Это сообщение понравилось {{count}} людям","many":"Это сообщение понравилось {{count}} людям","other":"Это сообщение понравилось {{count}} людям"},"has_likes_title_only_you":"Вам понравилось это сообщение","errors":{"create":"К сожалению, не удалось создать сообщение из-за ошибки. Попробуйте еще раз.","edit":"К сожалению, не удалось изменить сообщение. Попробуйте еще раз.","upload":"К сожалению, не удалось загрузить файл. Попробуйте еще раз.","attachment_too_large":"Файл, который вы пытаетесь загрузить, слишком большой (максимальный разрешенный размер {{max_size_kb}}КБ).","file_too_large":"К сожалению, файл, который вы пытаетесь загрузить, слишком большой (максимально допустимый размер {{max_size_kb}}kb)","too_many_uploads":"К сожалению, за один раз можно загрузить только одно изображение.","too_many_dragged_and_dropped_files":"За один раз можно перетянуть не более 10 файлов.","upload_not_authorized":"К сожалению, вы не можете загрузить файл данного типа (список разрешенных типов файлов: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"К сожалению, загрузка изображений недоступна новым пользователям.","attachment_upload_not_allowed_for_new_user":"К сожалению, загрузка файлов недоступна новым пользователям.","attachment_download_requires_login":"Войдите, чтобы скачивать прикрепленные файлы."},"abandon":{"confirm":"Вы уверены, что хотите отказаться от сообщения?","no_value":"Нет, оставить","yes_value":"Да, отказаться"},"via_email":"это сообщение пришло с почты","whisper":"Это внутреннее сообщение, т.е. оно видно только модераторам","wiki":{"about":"это вики-сообщение - любой пользователь может отредактировать его, чтобы улучшить, дополнить или исправить ошибки"},"archetypes":{"save":"Параметры сохранения"},"controls":{"reply":"начать составление ответа на сообщение","like":"мне нравится","has_liked":"Вам понравилось это сообщение","undo_like":"больше не нравится","edit":"Изменить сообщение","edit_anonymous":"Войдите, чтобы отредактировать это сообщение.","flag":"пожаловаться на сообщение","delete":"удалить сообщение","undelete":"отменить удаление","share":"поделиться ссылкой на сообщение","more":"Ещё","delete_replies":{"confirm":{"one":"Хотите ли вы удалить также и прямой ответ к этому сообщению?","few":"Хотите ли вы удалить также и {{count}} прямых ответа к этому сообщению?","many":"Хотите ли вы удалить также и {{count}} прямых ответов к этому сообщению?","other":"Хотите ли вы удалить также и {{count}} прямых ответов к этому сообщению?"},"yes_value":"Да, так же удалить ответы","no_value":"Нет, удалить только сообщение"},"admin":"действия администратора над сообщением","wiki":"Сделать вики-сообщением","unwiki":"Отменить вики-сообщение","convert_to_moderator":"Добавить цвет модератора","revert_to_regular":"Убрать цвет модератора","rebake":"Обработать сообщение заново - HTML","unhide":"Снова сделать видимым","change_owner":"Изменить владельца"},"actions":{"flag":"Жалоба","defer_flags":{"one":"Отложить жалобу","few":"Отложить жалобы","many":"Отложить жалобы","other":"Отложить жалобы"},"it_too":{"off_topic":"Пожаловаться","spam":"Пожаловаться","inappropriate":"Пожаловаться","custom_flag":"Пожаловаться","bookmark":"Добавить в закладки","like":"Мне тоже нравится","vote":"Проголосовать"},"undo":{"off_topic":"Отозвать жалобу","spam":"Отозвать жалобу","inappropriate":"Отозвать жалобу","bookmark":"Удалить из закладок","like":"Больше не нравится","vote":"Отозвать голос"},"people":{"off_topic":"{{icons}} отметили как оффтопик","spam":"{{icons}} отметили как спам","spam_with_url":"{{icons}} пометил \u003ca href='{{postUrl}}'\u003eэто как спам\u003c/a\u003e","inappropriate":"{{icons}} отметили как неуместное","notify_moderators":"{{icons}} пожаловались модераторам","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003eпожаловались модераторам\u003c/a\u003e","notify_user":"{{icons}} отправил(и) сообщение","notify_user_with_url":"{{icons}} отправил(и) \u003ca href='{{postUrl}}'\u003eсообщение\u003c/a\u003e","bookmark":"{{icons}} добавили в закладки","like":"Выразили симпатию: {{icons}}","vote":"{{icons}} проголосовали за"},"by_you":{"off_topic":"Помечена вами как оффтопик","spam":"Помечена вами как спам","inappropriate":"Помечена вами как неуместное","notify_moderators":"Вы отправили жалобу модератору","notify_user":"Вы отправили сообщение этому пользователю","bookmark":"Вы добавили сообщение в закладки","like":"Вам нравится","vote":"Вы проголосовали за данное сообщение"},"by_you_and_others":{"off_topic":{"one":"Вы и еще 1 человек отметили это как не относящееся к теме","few":"Вы и еще {{count}} человека отметили это как не относящееся к теме","many":"Вы и еще {{count}} человек отметили это как не относящееся к теме","other":"Вы и еще {{count}} человек отметили это как не относящееся к теме"},"spam":{"one":"Вы и еще 1 человек отметили это как спам","few":"Вы и еще {{count}} человека отметили это как спам","many":"Вы и еще {{count}} человек отметили это как спам","other":"Вы и еще {{count}} человек отметили это как спам"},"inappropriate":{"one":"Вы и еще 1 человек отметили это как неуместное","few":"Вы и еще {{count}} человека отметили это как неуместное","many":"Вы и еще {{count}} человек отметили это как неуместное","other":"Вы и еще {{count}} человек отметили это как неуместное"},"notify_moderators":{"one":"Вы и еще 1 человек отметили это как требующее модерации","few":"Вы и еще {{count}} человека отметили это как требующее модерации","many":"Вы и еще {{count}} человек отметили это как требующее модерации","other":"Вы и еще {{count}} человек отметили это как требующее модерации"},"notify_user":{"one":"Вы и еще 1 человек отправили сообщение этому пользователю","few":"Вы и еще {{count}} человека отправили сообщение этому пользователю","other":"Вы и еще {{count}} человек отправили сообщение этому пользователю"},"bookmark":{"one":"Вы и еще 1 человек добавили это сообщение в закладки","few":"Вы и еще {{count}} человека добавили это сообщение в закладки","many":"Вы и еще {{count}} человек добавили это сообщение в закладки","other":"Вы и еще {{count}} человек добавили это сообщение в закладки"},"like":{"one":"Вам и еще 1 человеку понравилось","few":"Вам и еще {{count}} людям понравилось","many":"Вам и еще {{count}} людям понравилось","other":"Вам и еще {{count}} людям понравилось"},"vote":{"one":"Вы и еще 1 человек проголосовали за это сообщение","few":"Вы и еще {{count}} человека проголосовали за это сообщение","many":"Вы и еще {{count}} человек проголосовали за это сообщение","other":"Вы и еще {{count}} человек проголосовали за это сообщение"}},"by_others":{"off_topic":{"one":"1 человек отметил это как не относящееся к теме","few":"{{count}} человека отметили это как не относящееся к теме","many":"{{count}} человек отметили это как не относящееся к теме","other":"{{count}} человек отметили это как не относящееся к теме"},"spam":{"one":"1 человек отметил это как спам","few":"{{count}} человека отметили это как спам","many":"{{count}} человек отметили это как спам","other":"{{count}} человек отметили это как спам"},"inappropriate":{"one":"1 человек отметил это как неуместное","few":"{{count}} человек отметили это как неуместное","many":"{{count}} человек отметили это как неуместное","other":"{{count}} человек отметили это как неуместное"},"notify_moderators":{"one":"1 человек отметил это как требующее модерации","few":"{{count}} человека отметили это как требующее модерации","many":"{{count}} человек отметили это как требующее модерации","other":"{{count}} человек отметили это как требующее модерации"},"notify_user":{"one":"1 человек отправил сообщение этому пользователю","few":"{{count}} человека отправили сообщение этому пользователю","other":"{{count}} человек отправили сообщение этому пользователю"},"bookmark":{"one":"1 человек добавил это сообщение в закладки","few":"{{count}} человека добавили это сообщение в закладки","many":"{{count}} человек добавили это сообщение в закладки","other":"{{count}} человек добавили это сообщение в закладки"},"like":{"one":"1 человеку понравилось","few":"{{count}} людям понравилось","many":"{{count}} людям понравилось","other":"{{count}} людям понравилось"},"vote":{"one":"1 человек проголосовал за это сообщение","few":"{{count}} человека проголосовали за это сообщение","many":"{{count}} человек проголосовали за это сообщение","other":"{{count}} человек проголосовали за это сообщение"}}},"delete":{"confirm":{"one":"Вы уверены, что хотите удалить это сообщение?","few":"Вы уверены, что хотите удалить все эти сообщения?","many":"Вы уверены, что хотите удалить все эти сообщения?","other":"Вы уверены, что хотите удалить все эти сообщения?"}},"revisions":{"controls":{"first":"Начальная версия","previous":"Предыдущая версия","next":"Следующая версия","last":"Последняя версия","hide":"Скрыть редакцию","show":"Показать редакцию","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Отобразить сообщение с включенными добавлениями и удалениями.","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Отобразить сообщение с построчными изменениями","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Показать отличия редакций бок о бок","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Исходный текст"}}}},"category":{"can":"может\u0026hellip; ","none":"(вне раздела)","all":"Все категории","choose":"Выберете раздел\u0026hellip;","edit":"изменить","edit_long":"Изменить","view":"Просмотр тем по разделам","general":"Общие","settings":"Настройки","topic_template":"Шаблон темы","delete":"Удалить раздел","create":"Создать Раздел","create_long":"Создать новый раздел","save":"Сохранить раздел","slug":"Ссылка Категории","slug_placeholder":"(Опция) дефисы в url","creation_error":"При создании нового раздела возникла ошибка.","save_error":"При сохранении раздела возникла ошибка.","name":"Название раздела","description":"Описание","topic":"тема раздела","logo":"Логотип раздела","background_image":"Фоновое изображение раздела","badge_colors":"Цвета наград","background_color":"Цвет фона","foreground_color":"Цвет переднего плана","name_placeholder":"Не более одного-двух слов","color_placeholder":"Любой цвет из веб-палитры","delete_confirm":"Вы действительно хотите удалить раздел?","delete_error":"При удалении раздела произошла ошибка.","list":"Список разделов","no_description":"Пожалуйста, добавьте описание для этого раздела.","change_in_category_topic":"Изменить описание","already_used":"Цвет уже используется другим разделом","security":"Безопасность","special_warning":"Внимание: данная категория была предустановлена и настройки безопасности не могут быть изменены. Если не хотите использовать эту категорию, удалите ее вместо изменения.","images":"Изображения","auto_close_label":"Закрыть тему через:","auto_close_units":"часов","email_in":"Индивидуальный адрес входящей почты:","email_in_allow_strangers":"Принимать письма от анонимных пользователей без учетных записей","email_in_disabled":"Создание новых тем через электронную почту отключено в настройках сайта. Чтобы разрешить создание новых тем через электронную почту,","email_in_disabled_click":"активируйте настройку \"email in\".","allow_badges_label":"Разрешить вручение наград в этом разделе","edit_permissions":"Изменить права доступа","add_permission":"Добавить права","this_year":"за год","position":"местоположение","default_position":"Позиция по умолчанию","position_disabled":"Разделы будут показаны в порядке активности. Чтобы настроить порядок разделов,","position_disabled_click":"включите настройку \"fixed category positions\".","parent":"Родительский раздел","notifications":{"watching":{"title":"Наблюдать","description":"Наблюдать за каждой новой темой в этом разделе. Уведомлять о всех ответах в темах и показывать счетчик новых непрочитанных ответов."},"tracking":{"title":"Следить","description":"Следить за каждой новой темой в этом разделе и показывать счетчик новых непрочитанных ответов. Вам придет уведомление, если кто-нибудь упомянет ваш @псевдоним или ответит на ваше сообщение."},"regular":{"title":"Уведомлять","description":"Уведомлять, если кто-нибудь упомянет мой @псевдоним или ответит на мое сообщение."},"muted":{"title":"Без уведомлений","description":"Не уведомлять о новых темах в этом разделе и скрыть их из последних."}}},"flagging":{"title":"Спасибо за вашу помощь в поддержании порядка!","private_reminder":"жалобы анонимны и видны \u003cb\u003eтолько\u003c/b\u003e персоналу","action":"Пожаловаться","take_action":"Принять меры","notify_action":"Сообщение","delete_spammer":"Удалить спамера","delete_confirm":"Вы собираетесь удалить \u003cb\u003e%{posts}\u003c/b\u003e сообщений и \u003cb\u003e%{topics}\u003c/b\u003e тем этого пользователя, а так же удалить его учетную запись, добавить его IP адрес \u003cb\u003e%{ip_address}\u003c/b\u003e и его почтовый адрес \u003cb\u003e%{email}\u003c/b\u003e в черный список. Вы действительно уверены, что ваши помыслы чисты и действия не продиктованы гневом?","yes_delete_spammer":"Да, удалить спамера","ip_address_missing":"(не доступно)","hidden_email_address":"(скрыто)","submit_tooltip":"Отправить приватную отметку","take_action_tooltip":"Достигнуть порога жалоб не дожидаясь большего количества жалоб от сообщества","cant":"Извините, но вы не можете сейчас послать жалобу.","formatted_name":{"off_topic":"Это не по теме","inappropriate":"Это неприемлемо","spam":"Это спам"},"custom_placeholder_notify_user":"Будьте точны, конструктивны и всегда доброжелательны.","custom_placeholder_notify_moderators":"Сообщите нам, чем конкретно вы обеспокоены и предоставьте соответствующие ссылки, если это возможно.","custom_message":{"at_least":"введите как минимум {{n}} символов","more":"Нужно ещё {{n}} cимволов...","left":"Осталось {{n}} символов"}},"flagging_topic":{"title":"Спасибо за вашу помощь!","action":"Пометить тему","notify_action":"Сообщение"},"topic_map":{"title":"Сводка по теме","participants_title":"Частые авторы","links_title":"Популярные ссылки","links_shown":"показать все {{totalLinks}} ссылок...","clicks":{"one":"1 клик","few":"%{count} клика","many":"%{count} кликов","other":"%{count} кликов"}},"topic_statuses":{"warning":{"help":"Это официальное предупреждение."},"bookmarked":{"help":"Вы добавили тему в Избранное "},"locked":{"help":"Тема закрыта; в ней больше нельзя отвечать"},"archived":{"help":"Тема заархивирована и не может быть изменена"},"locked_and_archived":{"help":"Тема закрыта и заархивирована. Она больше не принимает новые ответы и не может быть изменена"},"unpinned":{"title":"Откреплена","help":"Эта тема не закреплена; она будет отображаться в обычном порядке"},"pinned_globally":{"title":"Закреплена глобально"},"pinned":{"title":"Закреплена","help":"Тема закреплена; она будет показана вверху соответствующего раздела"},"invisible":{"help":"Тема исключена из всех списков тем и доступна только по прямой ссылке"}},"posts":"Сообщ.","posts_lowercase":"сообщения","posts_long":"{{number}} сообщений в теме","original_post":"Начальное сообщение","views":"Просм.","views_lowercase":{"one":"просмотр","few":"просмотра","other":"просмотров"},"replies":"Ответов","views_long":"тема просмотрена {{number}} раз","activity":"Активность","likes":"Нрав.","likes_lowercase":{"one":"лайк","few":"лайка","other":"лайков"},"likes_long":"{{number}} лайков в теме","users":"Пользователи","users_lowercase":{"one":"пользователь","few":"пользователя","other":"пользователей"},"category_title":"Раздел","history":"История","changed_by":"автором {{author}}","raw_email":{"title":"Исходное письмо","not_available":"Не доступно!"},"categories_list":"Список разделов","filters":{"with_topics":"%{filter} темы","with_category":"%{filter} %{category} темы","latest":{"title":"Последние","title_with_count":{"one":"Последние (1)","few":"Последние ({{count}})","many":"Последние ({{count}})","other":"Последние ({{count}})"},"help":"темы с недавними сообщениями"},"hot":{"title":"Популярные","help":"подборка популярных тем"},"read":{"title":"Прочитанные","help":"темы, которые вас заинтересовали (в обратном хронологическом порядке)"},"search":{"title":"Поиск","help":"искать во всех темах"},"categories":{"title":"Разделы","title_in":"Раздел - {{categoryName}}","help":"все темы, сгруппированные по разделам"},"unread":{"title":"Непрочитанные","title_with_count":{"one":"Непрочитанные (1)","few":"Непрочитанные ({{count}})","many":"Непрочитанные ({{count}})","other":"Непрочитанные ({{count}})"},"help":"наблюдаемые или отслеживаемые темы с непрочитанными сообщениями","lower_title_with_count":{"one":"1 непрочитанная","few":"{{count}} непрочитанных","many":"{{count}} непрочитанных","other":"{{count}} непрочитанных"}},"new":{"lower_title_with_count":{"one":"1 новая","few":"{{count}} новых","many":"{{count}} новых","other":"{{count}} новых"},"lower_title":"новые","title":"Новые","title_with_count":{"one":"Новые (1)","few":"Новые ({{count}})","many":"Новые ({{count}})","other":"Новые ({{count}})"},"help":"темы, созданные за последние несколько дней"},"posted":{"title":"Мои","help":"темы, в которых вы принимали участие"},"bookmarks":{"title":"Закладки","help":"темы, которые вы добавили в закладки"},"category":{"help":"последние темы в разделе {{categoryName}}"},"top":{"title":"Обсуждаемые","help":"наиболее активные темы за прошлый год, месяц, неделю или день","all":{"title":"За все время"},"yearly":{"title":"За год"},"monthly":{"title":"За месяц"},"weekly":{"title":"За неделю"},"daily":{"title":"За день"},"all_time":"За все время","this_year":"Год","this_quarter":"Квартал","this_month":"Месяц","this_week":"Неделя","today":"Сегодня","other_periods":"просмотреть выше"}},"browser_update":"К сожалению, ваш браузер устарел и не поддерживается этим сайтом. Пожалуйста, \u003ca href=\"http://browsehappy.com\"\u003eобновите браузер\u003c/a\u003e (нажмите на ссылку, чтобы узнать больше).","permission_types":{"full":"Создавать / Отвечать / Просматривать","create_post":"Отвечать / Просматривать","readonly":"Просматривать"},"poll":{"voters":{"one":"голос","few":"голоса","many":"голосов","other":"голосов"},"total_votes":{"one":"голос","few":"голоса","many":"голосов","other":"голосов"},"average_rating":"Средний рейтинг: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"Необходимо выбрать хотя бы \u003cstrong\u003e1\u003c/strong\u003e ответ.","few":"Необходимо выбрать хотя бы \u003cstrong\u003e%{count}\u003c/strong\u003e ответа.","many":"Необходимо выбрать хотя бы \u003cstrong\u003e%{count}\u003c/strong\u003e ответов.","other":"Необходимо выбрать хотя бы \u003cstrong\u003e%{count}\u003c/strong\u003e ответов."},"up_to_max_options":{"one":"Можно выбрать только \u003cstrong\u003e1\u003c/strong\u003e ответ.","few":"Можно выбрать до \u003cstrong\u003e%{count}\u003c/strong\u003e ответов.","many":"Можно выбрать до \u003cstrong\u003e%{count}\u003c/strong\u003e ответов.","other":"Можно выбрать до \u003cstrong\u003e%{count}\u003c/strong\u003e ответов."},"x_options":{"one":"Необходимо выбрать \u003cstrong\u003e1\u003c/strong\u003e ответ.","few":"Необходимо выбрать \u003cstrong\u003e%{count}\u003c/strong\u003e ответа.","many":"Необходимо выбрать \u003cstrong\u003e%{count}\u003c/strong\u003e ответов.","other":"Необходимо выбрать \u003cstrong\u003e%{count}\u003c/strong\u003e ответов."},"between_min_and_max_options":"Можно выбрать от \u003cstrong\u003e%{min}\u003c/strong\u003e до \u003cstrong\u003e%{max}\u003c/strong\u003e ответов."}},"cast-votes":{"title":"Проголосуйте","label":"Голосовать!"},"show-results":{"title":"Показать результаты","label":"Показать результаты"},"hide-results":{"title":"Вернуться к опросу","label":"Скрыть результаты"},"open":{"title":"Открыть опрос","label":"Открыть","confirm":"Вы уверены, что хотите открыть этот опрос?"},"close":{"title":"Закрыть опрос","label":"Закрыть","confirm":"Вы уверены, что хотите закрыть этот опрос?"},"error_while_toggling_status":"Произошла ошибка при смене статуса опроса.","error_while_casting_votes":"Произошла ошибка во время обработки вашего голоса."},"type_to_filter":"Введите текст для фильтрации...","admin":{"title":"Discourse Admin","moderator":"Модератор","dashboard":{"title":"Админка","last_updated":"Последнее обновление статистики:","version":"Версия","up_to_date":"Обновлений нет","critical_available":"Доступно критическое обновление.","updates_available":"Доступны обновления.","please_upgrade":"Пожалуйста, обновитесь!","no_check_performed":"Проверка обновлений не производится. Убедитесь, что запущен процесс sidekiq.","stale_data":"Проверка обновлений не в последнее время не производилась. Убедитесь, что запущен процесс sidekiq.","version_check_pending":"Вы недавно обновились. Замечательно!","installed_version":"У вас","latest_version":"Последняя","problems_found":"Обнаружены некоторые проблемы в вашей установке:","last_checked":"Последняя проверка","refresh_problems":"Обновить","no_problems":"Проблем не обнаружено.","moderators":"Модераторы:","admins":"Администраторы:","blocked":"Заблокированы:","suspended":"Заморожены:","private_messages_short":"Сообщ.","private_messages_title":"Сообщений","mobile_title":"Мобильный","space_free":"свободно {{size}}","uploads":"Загрузки","backups":"Резервные копии","traffic_short":"Трафик","traffic":"Трафик (веб-запросы)","page_views":"Запросы API","page_views_short":"Запросы API","show_traffic_report":"Раширенный отчет по трафику","reports":{"today":"Сегодня","yesterday":"Вчера","last_7_days":"7 дней","last_30_days":"30 дней","all_time":"За все время","7_days_ago":"7 дней назад","30_days_ago":"30 дней назад","all":"Всего","view_table":"Таблица","view_chart":"Диаграмма","refresh_report":"Обновить отчет","start_date":"Дата от","end_date":"Дата до"}},"commits":{"latest_changes":"Обновления в репозитории Github","by":"от"},"flags":{"title":"Жалобы","old":"Старые","active":"Активные","agree":"Принять","agree_title":"Подтвердить корректность жалобы","agree_flag_modal_title":"Принять и...","agree_flag_hide_post":"Принять (скрыть сообщение и послать личное сообщение)","agree_flag_hide_post_title":"Скрыть сообщение и автоматически отправить пользователю сообщение с просьбой исправить его","agree_flag_restore_post":"Согласиться (восстановить сообщение)","agree_flag_restore_post_title":"Восстановить это сообщение","agree_flag":"Принять жалобу","agree_flag_title":"Принять жалобу, оставить сообщение без изменений","defer_flag":"Отложить","defer_flag_title":"Удалить эту жалобу - никаких действий на данный момент не требуется.","delete":"Удалить","delete_title":"Удалить обжалованное сообщение.","delete_post_defer_flag":"Удалить сообщение и отложить жалобу","delete_post_defer_flag_title":"Удалить сообщение; если это первое сообщение, удалить тему целиком","delete_post_agree_flag":"Принять жалобу, удалить сообщение","delete_post_agree_flag_title":"Удалить сообщение; если это первое сообщение, удалить тему целиком","delete_flag_modal_title":"Удалить и...","delete_spammer":"Удалить спамера","delete_spammer_title":"Удалить пользователя и все его темы и сообщения.","disagree_flag_unhide_post":"Отклонить (сделать сообщение видимым)","disagree_flag_unhide_post_title":"Удалить все жалобы на это сообщение и сделать его снова видимым","disagree_flag":"Отклонить","disagree_flag_title":"Отклонить эту жалобу как некорректную","clear_topic_flags":"Готово","clear_topic_flags_title":"Тема была просмотрена, и все проблемы были решены. Нажмите Готово, чтобы удалить все жалобы.","more":"(еще ответы...)","dispositions":{"agreed":"принято","disagreed":"отклонено","deferred":"отложено"},"flagged_by":"Отмечено","resolved_by":"Разрешено","took_action":"Принята мера","system":"Системные","error":"что-то пошло не так","reply_message":"Ответить","no_results":"Жалоб нет.","topic_flagged":"Эта \u003cstrong\u003eтема\u003c/strong\u003e была помечена.","visit_topic":"Посетите тему чтобы принять меры","was_edited":"Сообщение было отредактировано после первой жалобы","previous_flags_count":"На это сообщение уже пожаловались {{count}} раз(а).","summary":{"action_type_3":{"one":"вне темы","few":"вне темы x{{count}}","many":"вне темы x{{count}}","other":"вне темы x{{count}}"},"action_type_4":{"one":"неуместно","few":"неуместно x{{count}}","many":"неуместно x{{count}}","other":"неуместно x{{count}}"},"action_type_6":{"one":"другое","few":"других x{{count}}","many":"других x{{count}}","other":"других x{{count}}"},"action_type_7":{"one":"другое","few":"других x{{count}}","many":"других x{{count}}","other":"других x{{count}}"},"action_type_8":{"one":"спам","few":"спам x{{count}}","many":"спам x{{count}}","other":"спам x{{count}}"}}},"groups":{"primary":"Основная группа","no_primary":"(нет основной группы)","title":"Группы","edit":"Изменить группы","refresh":"Обновить","new":"Новые","selector_placeholder":"введите имя пользователя","name_placeholder":"Название группы, без пробелов, по тем же правилам, что и для псевдонимов.","about":"Здесь можно редактировать группы и имена групп","group_members":"Участники группы","delete":"Удалить","delete_confirm":"Удалить данную группу?","delete_failed":"Невозможно удалить группу. Если это автоматически созданная группа, то она не может быть удалена.","delete_member_confirm":"Удалить '%{username}' из '%{group}'?","name":"Имя","add":"Добавить","add_members":"Добавить участников","custom":"Настраиваемые","automatic":"Автоматические","automatic_membership_email_domains":"Пользователи, которые регистрируются с доменом электронной почты, включенным в этот список, будут автоматически добавлены в эту группу:","automatic_membership_retroactive":"Применить тот же домен электронной почты чтобы добавить существующих зарегистрированных пользователей","default_title":"Заголовок по умолчанию для всех пользователей в группе","primary_group":"Автоматически использовать в качестве главной группы"},"api":{"generate_master":"Сгенерировать ключ API","none":"Отсутствует ключ API.","user":"Пользователь","title":"API","key":"Ключ API","generate":"Сгенерировать","regenerate":"Перегенерировать","revoke":"Отозвать","confirm_regen":"Вы уверены, что хотите заменить ключ API?","confirm_revoke":"Вы уверены, что хотите отозвать этот ключ?","info_html":"Ваш API ключ позволит вам создавать и обновлять темы, используя JSON calls.","all_users":"Все пользователи","note_html":"Никому \u003cstrong\u003eне сообщайте\u003c/strong\u003e этот ключ. Тот, у кого он есть, сможет создавать сообщения, выдавая себя за любого пользователя форума."},"plugins":{"title":"Плагины","installed":"Установленные плагины","name":"Название","none_installed":"Нет ни одного установленного плагина.","version":"Версия","enabled":"Включен?","is_enabled":"Y","not_enabled":"N","change_settings":"Настроить","change_settings_short":"Настройки","howto":"Как установить плагин?"},"backups":{"title":"Резервные копии","menu":{"backups":"Резервные копии","logs":"Журнал событий"},"none":"Нет доступных резервных копий","read_only":{"enable":{"title":"Включить режим \"только для чтения\"","label":"Включить режим \"только для чтения\"","confirm":"Вы уверены, что хотите включить режим \"только для чтения\"?"},"disable":{"title":"Выключить режим \"только для чтения\"","label":"Выключить режим \"только для чтения\""}},"logs":{"none":"Пока нет сообщений в журнале регистрации..."},"columns":{"filename":"Имя файла","size":"Размер"},"upload":{"label":"Загрузить","title":"Загрузить копию на сервер","uploading":"Загрузка...","success":"'{{filename}}' был успешно загружен.","error":"При загрузке '{{filename}}' произошла ошибка: {{message}}"},"operations":{"is_running":"Операция в данный момент исполняется...","failed":"{{operation}} провалилась. Пожалуйста, проверьте журнал регистрации.","cancel":{"label":"Отменить","title":"Отменить текущую операцию","confirm":"Вы уверены, что хотите отменить текущую операцию?"},"backup":{"label":"Резервная копия","title":"Создать резервную копию","confirm":"Запустить резервное копирование?","without_uploads":"Да (исключить файлы)"},"download":{"label":"Скачать","title":"Скачать резервную копию"},"destroy":{"title":"Удалить резервную копию","confirm":"Вы уверены, что хотите уничтожить резервную копию?"},"restore":{"is_disabled":"Восстановление отключено в настройках сайта.","label":"Восстановить","title":"Восстановить резервную копию","confirm":"Вы уверенны, что желаете восстановить эту резервную копию?"},"rollback":{"label":"Откатить","title":"Откатить базу данных к предыдущему рабочему состоянию","confirm":"Вы уверены, что хотите откатить базу данных к предыдущему рабочему состоянию?"}}},"export_csv":{"user_archive_confirm":"Вы уверены, то хотите скачать все ваши сообщения?","success":"Процедура экспорта начата, мы отправим вам сообщение, когда процесс будет завершен.","failed":"Экспорт не удался. Пожалуйста, проверьте логи.","rate_limit_error":"Записи могут быть загружены один раз в день, пожалуйста, попробуйте еще раз завтра.","button_text":"Экспорт","button_title":{"user":"Экспортировать список пользователей в CSV файл.","staff_action":"Экспортировать полный журнал действий персонала в CSV-файл.","screened_email":"Экспортировать список email-адресов в CSV формате.","screened_ip":"Экспортировать список IP в CSV формате.","screened_url":"Экспортировать список URL-адресов в CSV формате."}},"export_json":{"button_text":"Экспорт"},"invite":{"button_text":"Отправить приглашения","button_title":"Отправить приглашения"},"customize":{"title":"Оформление","long_title":"Стили и заголовки","css":"CSS","header":"Заголовок","top":"Топ","footer":"нижний колонтитул","head_tag":{"text":"\u003c/head\u003e","title":"HTML код, который будет добавлен перед тегом \u003c/head\u003e."},"body_tag":{"text":"\u003c/body\u003e","title":"HTML код, который будет добавлен перед тегом \u003c/body\u003e."},"override_default":"Не использовать стандартную таблицу стилей","enabled":"Разрешить?","preview":"как будет","undo_preview":"удалить предпросмотр","rescue_preview":"стиль по умолчанию","explain_preview":"Посмотреть сайт с этой таблицей стилей","explain_undo_preview":"Вернуться к текущей таблице стилей","explain_rescue_preview":"Посмотреть сайт со стандартной таблицей стилей","save":"Сохранить","new":"Новое","new_style":"Новый стиль","import":"Импорт","import_title":"Выберите файл или вставьте текст","delete":"Удалить","delete_confirm":"Удалить настройки?","about":"Измените CSS стили и HTML заголовки на сайте. Чтобы начать, внесите правки.","color":"Цвет","opacity":"Прозрачность","copy":"Копировать","email_templates":{"revert":"Отменить изменения"},"css_html":{"title":"CSS/HTML","long_title":"Настройка CSS и HTML"},"colors":{"title":"Цвета","long_title":"Цветовые схемы","about":"Изменить цвета, используемые на этом сайте, без редактирования CSS. Добавьте новую схему для начала.","new_name":"Новая цветовая схема","copy_name_prefix":"Копия","delete_confirm":"Удалить эту цветовую схему?","undo":"отменить","undo_title":"Отменить ваши изменения этого цвета с момента последнего сохранения.","revert":"вернуть","revert_title":"Вернуть этот цвет к стандартной цветовой схеме Discourse.","primary":{"name":"первичный","description":"Большинство текстов, иконок и границ."},"secondary":{"name":"вторичный","description":"Основной цвет фона и цвет текста для некоторых кнопок."},"tertiary":{"name":"третичный","description":"Ссылки, некоторые кнопки, уведомления и акцентный цвет."},"quaternary":{"name":"четвертичный","description":"Навигационные ссылки."},"header_background":{"name":"фон заголовка","description":"Фоновый цвет заголовка сайта."},"header_primary":{"name":"основной цвет заголовка","description":"Текст и иконки в заголовке сайта."},"highlight":{"name":"выделение","description":"Фоновый цвет выделенных элементов на странице, таких как сообщения и темы."},"danger":{"name":"опасность","description":"Цвет выделения для таких действий, как удаление сообщений и тем."},"success":{"name":"успех","description":"Используется, чтобы показать, что действие выполнено успешно."},"love":{"name":"любовь","description":"Цвет кнопки «Мне нравится»."},"wiki":{"name":"вики","description":"Базовый цвет, используемый для фона вики-сообщений."}}},"email":{"title":"Email","settings":"Настройки","all":"Все","sending_test":"Отправка тестового письма...","error":"\u003cb\u003eОШИБКА\u003c/b\u003e - %{server_error}","test_error":"При отправке тестового письма произошла ошибка. Пожалуйста, внимательно проверьте ваши почтовые настройки, проверьте, что ваш сервер не блокирует почтовые соединения, и попытайтесь снова.","sent":"Отправлено","skipped":"Пропущенные","sent_at":"Отправлено","time":"Время","user":"Пользователь","email_type":"Тип e-mail","to_address":"Адрес","test_email_address":"Электронный адрес для проверки","send_test":"Отправить тестовое письмо","sent_test":"отправлено!","delivery_method":"Метод отправки","preview_digest":"Просмотр сводки","refresh":"Обновить","format":"Формат","html":"html","text":"текст","last_seen_user":"Последнее посещение:","reply_key":"Ключ ответа","skipped_reason":"Причина пропуска","logs":{"none":"Записи в журнале регистрации не найдены.","filters":{"title":"Фильтр","user_placeholder":"псевдоним","address_placeholder":"name@example.com","type_placeholder":"дайджест, подписка...","reply_key_placeholder":"ключ ответа","skipped_reason_placeholder":"причина"}}},"logs":{"title":"Логи","action":"Действие","created_at":"Создано","last_match_at":"Последнее совпадение","match_count":"Совпадения","ip_address":"IP","topic_id":"ID темы","post_id":"ID сообщения","delete":"Удалить","edit":"Изменить","save":"Сохранить","screened_actions":{"block":"заблокировать","do_nothing":"ничего не делать"},"staff_actions":{"title":"Действия персонала","instructions":"Кликните по псевдониму или действиям для фильтрации списка. Кликните по аватару для перехода на страницу пользователя.","clear_filters":"Показать все","staff_user":"Персонал","target_user":"Целевой пользователь","subject":"Субъект","when":"Когда","context":"Контекст","details":"Подробности","previous_value":"Старое","new_value":"Новое","diff":"Различия","show":"Показать","modal_title":"Подробности","no_previous":"Старое значение отсутствует.","deleted":"Новое значение отсутствует. Запись была удалена.","actions":{"delete_user":"удаление пользователя","change_trust_level":"изменение уровня доверия","change_username":"изменение псевдонима","change_site_setting":"изменение настройки сайта","change_site_customization":"изменение настройки сайта","delete_site_customization":"удаление настроек сайта","suspend_user":"заморозка пользователя","unsuspend_user":"разморозка пользователя","grant_badge":"выдача награды","revoke_badge":"отозыв награды","check_email":"открыть e-mail","delete_topic":"удаление темы","delete_post":"удаление сообщения","impersonate":"выдавание себя за","anonymize_user":"анонимизация пользователя","roll_up":"группирование IP адресов в подсети","change_category_settings":"изменение настроек раздела","delete_category":"удаление раздела","create_category":"создание раздела"}},"screened_emails":{"title":"Почтовые адреса","description":"Когда кто-то создает новую учетную запись, проверяется данный почтовый адрес и регистрация блокируется или производятся другие дополнительные действия.","email":"Почтовый адрес","actions":{"allow":"Разрешить"}},"screened_urls":{"title":"Ссылки","description":"Список ссылок от пользователей, которые были идентифицированы как спамеры.","url":"URL","domain":"Домен"},"screened_ips":{"title":"IP адреса","description":"Список правил для IP адресов. Чтобы добавить IP адрес в белый список, используйте правило \"Разрешить\".","delete_confirm":"Удалить правило для IP адреса %{ip_address}?","roll_up_confirm":"Сгруппировать отдельные экранированные IP адреса в подсети?","rolled_up_some_subnets":"Заблокированные IP адреса сгруппированы в следующие подсети: %{subnets}.","rolled_up_no_subnet":"Ничего не найдено для группирования","actions":{"block":"Заблокировать","do_nothing":"Разрешить","allow_admin":"Разрешить админов"},"form":{"label":"Новое правило:","ip_address":"IP адрес","add":"Добавить","filter":"Поиск"},"roll_up":{"text":"Группировка","title":"Создание новой записи бана целой подсети если уже имеется хотя бы 'min_ban_entries_for_roll_up' записей отдельных IP адресов."}},"logster":{"title":"Журнаш ошибок"}},"impersonate":{"title":"Войти от имени пользователя","help":"Используйте этот инструмент, чтобы войти от имени пользователя. Может быть полезно для отладки. После этого необходимо выйти и зайти под своей учетной записью снова.","not_found":"Пользователь не найден.","invalid":"Извините, но вы не можете представиться этим пользователем."},"users":{"title":"Пользователи","create":"Добавить администратора","last_emailed":"Последнее письмо","not_found":"К сожалению, такой псевдоним не зарегистрирован.","id_not_found":"К сожалению, этот пользователь не зарегистрирован.","active":"Активные","show_emails":"Показать адреса e-mail","nav":{"new":"Новые","active":"Активные","pending":"Ожидает одобрения","staff":"Персонал","suspended":"Замороженные","blocked":"Заблокированные","suspect":"Подозрительные"},"approved":"Подтвердить?","approved_selected":{"one":"подтвердить пользователя","few":"подтвердить пользователей ({{count}})","many":"одобрить пользователей ({{count}})","other":"одобрить пользователей ({{count}})"},"reject_selected":{"one":"отклонить пользователя","few":"отклонить пользователей ({{count}})","many":"отклонить пользователей ({{count}})","other":"отклонить пользователей ({{count}})"},"titles":{"active":"Активные пользователи","new":"Новые пользователи","pending":"Пользователи, ожидающие одобрения","newuser":"Пользователи с уровнем доверия 0 (Новые пользователи)","basic":"Пользователи с уровнем доверия 1 (Базовые пользователи)","staff":"Персонал","admins":"Администраторы","moderators":"Модераторы","blocked":"Заблокированные пользователи","suspended":"Замороженные пользователи","suspect":"Подозрительные пользователи"},"reject_successful":{"one":"Успешно отклонен 1 пользователь.","few":"Успешно отклонены %{count} пользователя.","many":"Успешно отклонены %{count} пользователей.","other":"Успешно отклонены %{count} пользователей."},"reject_failures":{"one":"Не удалось отклонить 1 пользователя.","few":"Не удалось отклонить %{count} пользователей.","many":"Не удалось отклонить %{count} пользователей.","other":"Не удалось отклонить %{count} пользователей."},"not_verified":"Не проверенные","check_email":{"title":"Открыть e-mail этого пользователя","text":"Показать"}},"user":{"suspend_failed":"Ошибка заморозки пользователя {{error}}","unsuspend_failed":"Ошибка разморозки пользователя {{error}}","suspend_duration":"На сколько времени вы хотите заморозить пользователя?","suspend_duration_units":"(дней)","suspend_reason_label":"Причина заморозки? Данный текст \u003cb\u003eбудет виден всем\u003c/b\u003e на странице профиля пользователя и будет отображаться, когда пользователь пытается войти. Введите краткое описание.","suspend_reason":"Причина","suspended_by":"Заморожен","delete_all_posts":"Удалить все сообщения","delete_all_posts_confirm":"Вы собираетесь удалить %{posts} сообщений и %{topics} тем. Вы уверены?","suspend":"Заморозить","unsuspend":"Разморозить","suspended":"Заморожен?","moderator":"Модератор?","admin":"Администратор?","blocked":"Заблокирован?","show_admin_profile":"Администратор","edit_title":"Редактировать заголовок","save_title":"Сохранить заголовок","refresh_browsers":"Выполнить перезагрузку браузера","refresh_browsers_message":"Сообщение отправлено всем клиентам!","show_public_profile":"Показать публичный профиль","impersonate":"Представиться как пользователь","ip_lookup":"Поиск IP","log_out":"Выйти","logged_out":"Пользователь вышел с сайта на всех устройствах","revoke_admin":"Лишить прав Администратора","grant_admin":"Выдать права Администратора","revoke_moderation":"Лишить прав Модератора","grant_moderation":"Выдать права Модератора","unblock":"Разблокировать","block":"Заблокировать","reputation":"Репутация","permissions":"Права","activity":"Активность","like_count":"Симпатий выразил / получил","last_100_days":"за последние 100 дней","private_topics_count":"Частные темы","posts_read_count":"Прочитано сообщений","post_count":"Создано сообщений","topics_entered":"Просмотрено тем","flags_given_count":"Отправлено жалоб","flags_received_count":"Получено жалоб","warnings_received_count":"Получено предупреждений","flags_given_received_count":"Жалоб отправил / получил","approve":"Одобрить","approved_by":"кем одобрено","approve_success":"Пользователь одобрен и на электронную почту отправлено письмо с инструкцией по активации.","approve_bulk_success":"Успех! Все выбранные пользователи были одобрены и уведомлены.","time_read":"Время чтения","anonymize":"Анонимизировать пользователя","anonymize_confirm":"Вы точно УВЕРЕНЫ, что хотите анонимизировать эту учетную запись? Это приведет к изменению псевдонима и адреса электронной почты и очистит всю информацию профиля.","anonymize_yes":"Да, анонимизировать эту учетную запись","anonymize_failed":"Не удалось анонимизировать учетную запись.","delete":"Удалить пользователя","delete_forbidden_because_staff":"Администраторы и модераторы не могут быть удалены","delete_posts_forbidden_because_staff":"Нельзя удалить все сообщения администраторов и модераторов.","delete_forbidden":{"one":"Пользователи не могут быть удалены, если у них есть сообщения. Перед удалением пользователя удалите все его сообщения. (Сообщения старше %{count} дня не могут быть удалены.)","few":"Пользователи не могут быть удалены, если у них есть сообщения. Перед удалением пользователя удалите все его сообщения. (Сообщения старше %{count} дней не могут быть удалены.)","many":"Пользователи не могут быть удалены, если у них есть сообщения. Перед удалением пользователя удалите все его сообщения. (Сообщения старше %{count} дней не могут быть удалены.)","other":"Пользователи не могут быть удалены, если у них есть сообщения. Перед удалением пользователя удалите все его сообщения. (Сообщения старше %{count} дней не могут быть удалены.)"},"cant_delete_all_posts":{"one":"Не удается удалить все сообщения. Некоторые сообщения старше %{count} дня. (Настройка delete_user_max_post_age.)","few":"Не удается удалить все сообщения. Некоторые сообщения старше %{count} дней. (Настройка delete_user_max_post_age.)","many":"Не удается удалить все сообщения. Некоторые сообщения старше %{count} дней. (Настройка delete_user_max_post_age.)","other":"Не удается удалить все сообщения. Некоторые сообщения старше %{count} дней. (Настройка delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Не удается удалить все сообщения, потому что у пользователя более 1 сообщения.  (Настройка delete_all_posts_max.)","few":"Не удается удалить все сообщения, потому что у пользователя более %{count} сообщений.  (Настройка delete_all_posts_max.)","many":"Не удается удалить все сообщения, потому что у пользователя более %{count} сообщений.  (Настройка delete_all_posts_max.)","other":"Не удается удалить все сообщения, потому что у пользователя более %{count} сообщений.  (Настройка delete_all_posts_max.)"},"delete_confirm":"Вы УВЕРЕНЫ, что хотите удалить этого пользователя? Это действие необратимо!","delete_and_block":"Удалить и \u003cb\u003eзаблокировать\u003c/b\u003e этот e-mail и IP адрес","delete_dont_block":"Только удалить","deleted":"Пользователь удален.","delete_failed":"При удалении пользователя возникла ошибка. Для удаления пользователя необходимо сначала удалить все его сообщения.","send_activation_email":"Послать активационное письмо","activation_email_sent":"Активационное письмо отправлено.","send_activation_email_failed":"К сожалению, возникла ошибка при повторной отправке активационного письма. %{error}","activate":"Активировать","activate_failed":"Во время активации пользователя произошла ошибка.","deactivate_account":"Деактивировать","deactivate_failed":"Во время деактивации пользователя произошла ошибка.","unblock_failed":"Не удалось разблокировать пользователя.","block_failed":"Не удалось заблокировать пользователя.","deactivate_explanation":"Дезактивированные пользователи должны заново подтвердить свой e-mail.","suspended_explanation":"Замороженный пользователь не может войти.","block_explanation":"Заблокированный не может отвечать и создавать новые темы.","trust_level_change_failed":"Возникла ошибка при изменении уровня доверия пользователя.","suspend_modal_title":"Заморозить пользователя","trust_level_2_users":"Пользователи с уровнем доверия 2","trust_level_3_requirements":"Требуется 3 уровень доверия","trust_level_locked_tip":"уровень доверия заморожен, система не сможет по надобности разжаловать или продвинуть пользователя","trust_level_unlocked_tip":"уровень доверия разморожен, система сможет по надобности разжаловать или продвинуть пользователя","lock_trust_level":"Заморозить уровень доверия","unlock_trust_level":"Разморозить уровень доверия","tl3_requirements":{"title":"Требования для 3 уровня доверия","table_title":"За последние 100 дней:","value_heading":"Значение","requirement_heading":"Требование","visits":"Посещений","days":"дни","topics_replied_to":"Ответы на темы","topics_viewed":"Просмотрено тем","topics_viewed_all_time":"Просмотрено тем (за все время)","posts_read":"Прочитано сообщений","posts_read_all_time":"Прочитано сообщений (за все время)","flagged_posts":"Сообщения с жалобами","flagged_by_users":"Пользователи, подававшие жалобы","likes_given":"Выразил симпатий","likes_received":"Получил симпатий","likes_received_days":"Получено симпатий: отдельные дни","likes_received_users":"Получено симпатий: уникальные пользователи","qualifies":"Заслуживает уровень доверия 3.","does_not_qualify":"Не заслуживает уровень доверия 3.","will_be_promoted":"Пользователь будет скоро продвинут до этого уровня.","will_be_demoted":"Пользователь скоро будет разжалован.","on_grace_period":"В данный момент в периоде доверия и не может быть разжалован.","locked_will_not_be_promoted":"Уровень доверия заморожен, поэтому пользователь никогда не будет продвинут до этого уровня.","locked_will_not_be_demoted":"Уровень доверия заморожен, поэтому пользователь никогда не будет разжалован."},"sso":{"title":"Технология единого входа SSO","external_id":"Внешний идентификатор","external_username":"Псевдоним","external_name":"Имя","external_email":"E-mail","external_avatar_url":"URL фона профиля"}},"user_fields":{"title":"Поля пользователя","help":"Добавить поля, которые пользователи смогут заполнять.","create":"Создать поле пользователя","untitled":"Без заголовка","name":"Название поля","type":"Тип поля","description":"Описание поля","save":"Сохранить","edit":"Изменить","delete":"Удалить","cancel":"Отмена","delete_confirm":"Вы уверены, что хотите удалить это поле?","options":"Опции","required":{"title":"Обязательное во время регистрации?","enabled":"Обязательное","disabled":"Необязательное"},"editable":{"title":"Редактируемое после регистрации?","enabled":"Редактируемое","disabled":"Нередактируемое"},"show_on_profile":{"title":"Показывать в публичном профиле?","enabled":"Показывать в профиле","disabled":"Не показывать в профиле"},"field_types":{"text":"Текстовое поле","confirm":"Подтверждение","dropdown":"Выпадающий список"}},"site_text":{"none":"Выберите секцию для редактирования.","title":"Текстовое содержание"},"site_settings":{"show_overriden":"Показывать только измененные","title":"Настройки","reset":"Вернуть по умолчанию","none":"(нет)","no_results":"Ничего не найдено.","clear_filter":"Очистить","add_url":"Добавить URL","add_host":"добавить хост","categories":{"all_results":"Все настройки","required":"Обязательное","basic":"Основное","users":"Пользователи","posting":"Сообщения","email":"E-mail","files":"Файлы","trust":"Уровни доверия","security":"Безопасность","onebox":"Умная вставка","seo":"Поисковая оптимизация (SEO)","spam":"Спам","rate_limits":"Ограничения","developer":"Программистам","embedding":"Встраивание","legal":"Юридическое","uncategorized":"Вне разделов","backups":"Резервные копии","login":"Учетные записи","plugins":"Плагины"}},"badges":{"title":"Награды","new_badge":"Новая награда","new":"Новая","name":"Название","badge":"Награда","display_name":"Отображаемое название","description":"Описание","badge_type":"Тип награды","badge_grouping":"Группа","badge_groupings":{"modal_title":"Типы наград"},"granted_by":"Кем выдана","granted_at":"Когда выдана","reason_help":"(Ссылка на сообщение или тему)","save":"Сохранить","delete":"Удалить","delete_confirm":"Вы уверены, что хотите удалить эту награду?","revoke":"Отозвать","reason":"Причина","expand":"Развернуть \u0026hellip;","revoke_confirm":"Вы уверены, что хотите отозвать эту награду?","edit_badges":"Редактировать награды","grant_badge":"Выдать награду","granted_badges":"Выданные награды","grant":"Выдать","no_user_badges":"У %{name} нет ни одной награды.","no_badges":"Нет наград, которые можно было бы выдать.","none_selected":"Выберите награду в списке слева","allow_title":"Разрешить использовать название награды в качестве титула","multiple_grant":"Может быть предоставлен несколько раз","listable":"Отображать награду на публичной странице наград","enabled":"Активировать использование награды","icon":"Иконка","image":"Картинка","icon_help":"Используйте класс шрифта Font Awesome или ссылку на картинку","query":"Выборка награды (SQL)","target_posts":"Выборка целевых сообщений","auto_revoke":"Запускать запрос на отзыв ежедневно","show_posts":"Показывать сообщение, на основе которого была выдана награда, на странице наград","trigger":"Запуск","trigger_type":{"none":"Обновлять ежедневно","post_action":"Когда пользователь совершает действие над сообщением","post_revision":"Когда пользователь редактирует или создает сообщение","trust_level_change":"Когда пользователь меняет уровень доверия","user_change":"Когда создается или редактируется пользователь"},"preview":{"link_text":"Предварительный просмотр выданных наград","plan_text":"Предварительный просмотр с анализом быстродействия","modal_title":"Предосмотр запроса награды","sql_error_header":"В запросе произошла ошибка.","error_help":"См. следующую ссылку с информацией по запросам для наград.","bad_count_warning":{"header":"ВНИМАНИЕ!","text":"Обнаружены несуществующие примеры выдачи наград. Это может произойти, когда запрос возвращает несуществующие идентификаторы ID пользователей или сообщений. Это может привести к неожиданным проблемам со временем, поэтому внимательно проверьте ваш запрос."},"sample":"Пример:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e за сообщение в %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e за сообщение в %{link} в \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e в \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Иконки","help":"Добавить новые смайлики-emoji, которые будут доступны всем. (Подсказка: можно перетаскивать несколько файлов за раз)","add":"Добавить новую иконку","name":"Название","image":"Изображение","delete_confirm":"Вы уверены, что хотите удалить иконку :%{name}:?"},"permalink":{"form":{"add":"Добавить"}}},"lightbox":{"download":"загрузить"},"search_help":{"title":"Справка по поиску"},"keyboard_shortcuts_help":{"title":"Сочетания клавиш","jump_to":{"title":"Перейти к","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Домой","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Последние","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Новые","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Непрочитанные","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Разделы","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Вверх","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Закладки"},"navigation":{"title":"Навигация","jump":"\u003cb\u003e#\u003c/b\u003e Перейти к сообщение №","back":"\u003cb\u003eu\u003c/b\u003e Назад","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Переместить выделение \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e или \u003cb\u003eEnter\u003c/b\u003e Открыть выбранную тему","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Следующая/предыдущая секция"},"application":{"title":"Приложение","create":"\u003cb\u003ec\u003c/b\u003e Создать новую тему","notifications":"\u003cb\u003en\u003c/b\u003e Открыть уведомления","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Открыть меню моего профиля","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Показать обновленные темы","search":"\u003cb\u003e/\u003c/b\u003e Поиск","help":"\u003cb\u003e?\u003c/b\u003e Открыть помощь по горячим клавишам","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Отложить новые сообщения","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Отложить темы"},"actions":{"title":"Действия","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Добавить в Избранное","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Закрепить/Открепить тему","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Поделиться темой","share_post":"\u003cb\u003es\u003c/b\u003e Поделиться сообщением","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Ответить в новой связанной теме","reply_topic":"\u003cb\u003eshiftr\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Ответить на тему","reply_post":"\u003cb\u003er\u003c/b\u003e Ответить на сообщение","quote_post":"\u003cb\u003eq\u003c/b\u003e Цитировать сообщение","like":"\u003cb\u003el\u003c/b\u003e Лайкнуть сообщение","flag":"\u003cb\u003e!\u003c/b\u003e Пожаловаться на сообщение","bookmark":"\u003cb\u003eb\u003c/b\u003e Добавить сообщение в избранные","edit":"\u003cb\u003ee\u003c/b\u003e Изменить сообщение","delete":"\u003cb\u003ed\u003c/b\u003e Удалить сообщение","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Отключить уведомления в теме","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Включить уведомления в теме","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Отслеживать тему","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Наблюдать за темой"}},"badges":{"title":"Награды","allow_title":"Разрешить использовать в качестве титула","multiple_grant":"может быть получено несколько раз","badge_count":{"one":"1 награда","few":"%{count} награды","many":"%{count} наград","other":"%{count} наград"},"more_badges":{"one":"+ еще 1","few":"+ еще %{count}","many":"+ еще %{count}","other":"+ еще %{count}"},"granted":{"one":"выдан 1","few":"выдано %{count}","many":"выдано %{count}","other":"выдано %{count}"},"select_badge_for_title":"Использовать награду в качестве вашего титула","none":"\u003cотсутствует\u003e","badge_grouping":{"getting_started":{"name":"Начало"},"community":{"name":"Сообщество"},"trust_level":{"name":"Уровень доверия"},"other":{"name":"Прочее"},"posting":{"name":"Темы и сообщения"}},"badge":{"editor":{"name":"Редактор","description":"Впервые отредактировал сообщение"},"basic_user":{"name":"Базовый","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eПолучил доступ\u003c/a\u003e ко всем основным функциям сообщества"},"member":{"name":"Участник","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eПолучил возможность\u003c/a\u003e приглашать новых пользователей в сообщество"},"regular":{"name":"Активный","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eПолучил возможность\u003c/a\u003e изменять раздел тем и переименовывать их, а также доступ к Фойе и отслеживаемым ссылкам"},"leader":{"name":"Лидер","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eПолучил глобальные права \u003c/a\u003e редактировать, прилепливать, закрывать, архивировать, разделять и соединять темы"},"welcome":{"name":"Добро пожаловать","description":"Получил отметку \"Мне нравится\""},"autobiographer":{"name":"Автобиограф","description":"Заполнил информацию в \u003ca href=\"/my/preferences\"\u003eпрофиле пользователя\u003c/a\u003e"},"anniversary":{"name":"Годовщина","description":"Активный пользователь в течении года, создал как минимум одну тему."},"nice_post":{"name":"Хорошее сообщение","description":"Получил 10 отметок \"Мне нравится\" за свое сообщение. Эта награда может быть выдана более одного раза"},"good_post":{"name":"Отличное сообщение","description":"Получил 25 отметок \"Мне нравится\" за свое сообщение. Эта награда может быть выдана более одного раза"},"great_post":{"name":"Отменное сообщение","description":"Получил 50 отметок \"Мне нравится\" за свое сообщение. Эта награда может быть выдана более одного раза"},"nice_topic":{"name":"Хорошая тема","description":"Получил 10 отметок \"Мне нравится\" за свою тему. Эта награда может быть выдана более одного раза"},"good_topic":{"name":"Отличная тема","description":"Получил 25 отметок \"Мне нравится\" за свою тему. Эта награда может быть выдана более одного раза"},"great_topic":{"name":"Отменная тема","description":"Получил 50 отметок \"Мне нравится\" за свою тему. Эта награда может быть выдана более одного раза"},"nice_share":{"name":"Хороший вклад в популярность","description":"Поделился ссылкой на сообщение, и ее открыли 25 раз"},"good_share":{"name":"Значительный вклад в популярность","description":"Поделился ссылкой на сообщение, и ее открыли 300 раз"},"great_share":{"name":"Бесценный вклад в популярность","description":"Поделился ссылкой на сообщение, и ее открыли 1000 раз"},"first_like":{"name":"Первая симпатия","description":"Понравилось сообщение"},"first_flag":{"name":"Первая жалоба","description":"Помог модератору, обратив его внимание на проблемное сообщение"},"promoter":{"name":"Промоутер","description":"Пригласил нового пользователя"},"campaigner":{"name":"Активист","description":"Пригласил троих пользователей, достигших 1-го уровня доверия"},"champion":{"name":"Чемпион","description":"Пригласил пятерых пользователей, достигших 2-го уровня доверия"},"first_share":{"name":"Первый вклад в популярность","description":"Впервые поделился ссылкой на сообщение"},"first_link":{"name":"Первая ссылка","description":"Добавил внутреннюю ссылку на другую тему"},"first_quote":{"name":"Первая цитата","description":"Процитировал другого пользователя"},"read_guidelines":{"name":"Руководство пользователя","description":"Прочитал \u003ca href=\"/guidelines\"\u003eруководство пользователя\u003c/a\u003e"},"reader":{"name":"Читатель","description":"Прочитал каждое сообщение в теме с более чем 100 сообщениями"},"popular_link":{"name":"Популярная ссылка","description":"Оставил внешнюю ссылку с более чем 50 кликов"},"hot_link":{"name":"Горячая ссылка","description":"Оставил внешнюю ссылку с более чем 300 кликов"},"famous_link":{"name":"Легендарная ссылка","description":"Использовал внешнюю ссылку, которую открыли более 1000 раз"}}},"google_search":"\u003ch3\u003eПоиск через Google\u003c/h3\u003e\n\u003cp\u003e\n\u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n\u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n\u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n\u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n\u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","posted":"Post by","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","moved_post":"Your post was moved by","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}"},"topics":{"bulk":{"unlist_topics":"Unlist Topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls"},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"}},"category":{"contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage."},"flagging":{"notify_staff":"Notify Staff"},"topic_statuses":{"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"filters":{"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"quarterly":{"title":"Quarterly"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"embedded_css":"Embedded CSS","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert_confirm":"Are you sure you want to revert your changes?"}},"email":{"preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID"},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"categories":{"user_preferences":"User Preferences"}},"badges":{"preview":{"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","filter":"Search (URL or External URL)"}}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}}}}};
I18n.locale = 'ru';
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
// locale : russian (ru)
// author : Viktorminator : https://github.com/Viktorminator
// Author : Menelion Elensúle : https://github.com/Oire

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    function plural(word, num) {
        var forms = word.split('_');
        return num % 10 === 1 && num % 100 !== 11 ? forms[0] : (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20) ? forms[1] : forms[2]);
    }

    function relativeTimeWithPlural(number, withoutSuffix, key) {
        var format = {
            'mm': withoutSuffix ? 'минута_минуты_минут' : 'минуту_минуты_минут',
            'hh': 'час_часа_часов',
            'dd': 'день_дня_дней',
            'MM': 'месяц_месяца_месяцев',
            'yy': 'год_года_лет'
        };
        if (key === 'm') {
            return withoutSuffix ? 'минута' : 'минуту';
        }
        else {
            return number + ' ' + plural(format[key], +number);
        }
    }

    function monthsCaseReplace(m, format) {
        var months = {
            'nominative': 'январь_февраль_март_апрель_май_июнь_июль_август_сентябрь_октябрь_ноябрь_декабрь'.split('_'),
            'accusative': 'января_февраля_марта_апреля_мая_июня_июля_августа_сентября_октября_ноября_декабря'.split('_')
        },

        nounCase = (/D[oD]?(\[[^\[\]]*\]|\s+)+MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return months[nounCase][m.month()];
    }

    function monthsShortCaseReplace(m, format) {
        var monthsShort = {
            'nominative': 'янв_фев_мар_апр_май_июнь_июль_авг_сен_окт_ноя_дек'.split('_'),
            'accusative': 'янв_фев_мар_апр_мая_июня_июля_авг_сен_окт_ноя_дек'.split('_')
        },

        nounCase = (/D[oD]?(\[[^\[\]]*\]|\s+)+MMMM?/).test(format) ?
            'accusative' :
            'nominative';

        return monthsShort[nounCase][m.month()];
    }

    function weekdaysCaseReplace(m, format) {
        var weekdays = {
            'nominative': 'воскресенье_понедельник_вторник_среда_четверг_пятница_суббота'.split('_'),
            'accusative': 'воскресенье_понедельник_вторник_среду_четверг_пятницу_субботу'.split('_')
        },

        nounCase = (/\[ ?[Вв] ?(?:прошлую|следующую)? ?\] ?dddd/).test(format) ?
            'accusative' :
            'nominative';

        return weekdays[nounCase][m.day()];
    }

    return moment.defineLocale('ru', {
        months : monthsCaseReplace,
        monthsShort : monthsShortCaseReplace,
        weekdays : weekdaysCaseReplace,
        weekdaysShort : "вс_пн_вт_ср_чт_пт_сб".split("_"),
        weekdaysMin : "вс_пн_вт_ср_чт_пт_сб".split("_"),
        monthsParse : [/^янв/i, /^фев/i, /^мар/i, /^апр/i, /^ма[й|я]/i, /^июн/i, /^июл/i, /^авг/i, /^сен/i, /^окт/i, /^ноя/i, /^дек/i],
        longDateFormat : {
            LT : "HH:mm",
            L : "DD.MM.YYYY",
            LL : "D MMMM YYYY г.",
            LLL : "D MMMM YYYY г., LT",
            LLLL : "dddd, D MMMM YYYY г., LT"
        },
        calendar : {
            sameDay: '[Сегодня в] LT',
            nextDay: '[Завтра в] LT',
            lastDay: '[Вчера в] LT',
            nextWeek: function () {
                return this.day() === 2 ? '[Во] dddd [в] LT' : '[В] dddd [в] LT';
            },
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[В прошлое] dddd [в] LT';
                case 1:
                case 2:
                case 4:
                    return '[В прошлый] dddd [в] LT';
                case 3:
                case 5:
                case 6:
                    return '[В прошлую] dddd [в] LT';
                }
            },
            sameElse: 'L'
        },
        relativeTime : {
            future : "через %s",
            past : "%s назад",
            s : "несколько секунд",
            m : relativeTimeWithPlural,
            mm : relativeTimeWithPlural,
            h : "час",
            hh : relativeTimeWithPlural,
            d : "день",
            dd : relativeTimeWithPlural,
            M : "месяц",
            MM : relativeTimeWithPlural,
            y : "год",
            yy : relativeTimeWithPlural
        },

        meridiemParse: /ночи|утра|дня|вечера/i,
        isPM : function (input) {
            return /^(дня|вечера)$/.test(input);
        },

        meridiem : function (hour, minute, isLower) {
            if (hour < 4) {
                return "ночи";
            } else if (hour < 12) {
                return "утра";
            } else if (hour < 17) {
                return "дня";
            } else {
                return "вечера";
            }
        },

        ordinal: function (number, period) {
            switch (period) {
            case 'M':
            case 'd':
            case 'DDD':
                return number + '-й';
            case 'D':
                return number + '-го';
            case 'w':
            case 'W':
                return number + '-я';
            default:
                return number;
            }
        },

        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 7  // The week that contains Jan 1st is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM YYYY'); };
moment.fn.longDate = function(){ return this.format('D MMMM YYYY, HH:mm'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};

I18n.pluralizationRules['ru'] = function (n) {
  if (n % 10 == 1 && n % 100 != 11) return "one";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return "few";
  return "other";
};
