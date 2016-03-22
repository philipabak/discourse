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
MessageFormat.locale.fr = function (n) {
  if (n >= 0 && n < 2) {
    return 'one';
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
r += "Il y ";
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
r += "<a href='/unread'>a 1 sujet non lu</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "<a href='/unread'>a " + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " sujets non lus</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["fr"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "et ";
return r;
},
"false" : function(d){
var r = "";
r += "a ";
return r;
},
"other" : function(d){
var r = "";
return r;
}
};
r += (pf_1[ k_2 ] || pf_1[ "other" ])( d );
r += " <a href='/new'>1 nouveau</a> sujet";
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
r += "et ";
return r;
},
"false" : function(d){
var r = "";
r += "a ";
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
})() + " nouveaux</a> sujets";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["fr"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " restant, ou ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "consulter les autres sujets dans ";
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
r += "Ce sujet a ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 réponse";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " réponses";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["fr"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += "  ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "ratio";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"low" : function(d){
var r = "";
r += "avec un haut ratio de J'aime/Message";
return r;
},
"med" : function(d){
var r = "";
r += "avec un très haut ratio J'aime/Message";
return r;
},
"high" : function(d){
var r = "";
r += "avec un énorme ratio J'aime/Message";
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
}});I18n.translations = {"fr":{"js":{"number":{"format":{"separator":",","delimiter":" "},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Octet","other":"Octets"},"gb":"Go","kb":"Ko","mb":"Mo","tb":"To"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"H:mm","long_no_year":"DD MMM H:mm","long_no_year_no_time":"D MMM","full_no_year_no_time":"Do MMMM","long_with_year":"DD MMM YYY H:mm","long_with_year_no_time":"DD MMM YYYY","full_with_year_no_time":"Do MMMM, YYYY","long_date_with_year":"D MMM, 'YY LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM, 'YY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}h"},"x_days":{"one":"1j","other":"%{count}j"},"about_x_years":{"one":"1a","other":"%{count}a"},"over_x_years":{"one":"\u003e 1a","other":"\u003e %{count}a"},"almost_x_years":{"one":"1y","other":"%{count}a"},"date_month":"D MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 min","other":"%{count} mins"},"x_hours":{"one":"1 heure","other":"%{count} heures"},"x_days":{"one":"1 jour","other":"%{count} jours"},"date_year":"D MMM 'YY"},"medium_with_ago":{"x_minutes":{"one":"Il y a 1 min","other":"Il y a %{count} mins"},"x_hours":{"one":"Il y a 1 heure","other":"Il y a %{count} heures"},"x_days":{"one":"Il y a 1 jour","other":"Il y a %{count} jours"}},"later":{"x_days":{"one":"1 jour plus tard","other":"%{count} jours plus tard"},"x_months":{"one":"1 mois plus tard","other":"%{count} mois plus tard"},"x_years":{"one":"1 année plus tard","other":"%{count} années plus tard"}}},"share":{"topic":"partager ce sujet","post":"message #%{postNumber}","close":"fermer","twitter":"partager ce lien sur Twitter","facebook":"partager ce lien sur Facebook","google+":"partager ce lien sur Google+","email":"envoyer ce lien dans un courriel"},"action_codes":{"split_topic":"a été découpé ce sujet %{when}","autoclosed":{"enabled":"fermé %{when}","disabled":"ouvert %{when}"},"closed":{"enabled":"fermé %{when}","disabled":"ouvert %{when}"},"archived":{"enabled":"archivé %{when}","disabled":"sorti des archives %{when}"},"pinned":{"enabled":"épinglé %{when}","disabled":"désépinglé %{when}"},"pinned_globally":{"enabled":"épinglé globalement %{when}","disabled":"désépinglé %{when}"},"visible":{"enabled":"listé %{when}","disabled":"délisté %{when}"}},"topic_admin_menu":"actions administrateur pour ce sujet","emails_are_disabled":"Le courriel sortant a été désactivé par un administrateur. Aucune notification courriel ne sera envoyée.","edit":"éditer le titre et la catégorie de ce sujet","not_implemented":"Cette fonctionnalité n'a pas encore été implémentée, désolé.","no_value":"Non","yes_value":"Oui","generic_error":"Désolé, une erreur est survenue.","generic_error_with_reason":"Une erreur est survenue: %{error}","sign_up":"S'inscrire","log_in":"Se connecter","age":"Âge","joined":"Inscrit","admin_title":"Admin","flags_title":"Signalements","show_more":"afficher plus","show_help":"options","links":"Liens","links_lowercase":{"one":"lien","other":"liens"},"faq":"FAQ","guidelines":"Règlement","privacy_policy":"Politique de confidentialité","privacy":"Confidentialité","terms_of_service":"Conditions Générales d'Utilisation","mobile_view":"Vue mode Mobile","desktop_view":"Vue mode Bureau","you":"Vous","or":"ou","now":"à l'instant","read_more":"lire la suite","more":"Plus","less":"Moins","never":"jamais","daily":"quotidiennes","weekly":"hebdomadaires","every_two_weeks":"bi-mensuelles","every_three_days":"tous les trois jours","max_of_count":"maximum sur {{count}}","alternation":"ou","character_count":{"one":"{{count}} caractère","other":"{{count}} caractères"},"suggested_topics":{"title":"Sujets similaires"},"about":{"simple_title":"A propos","title":"A propos de %{title}","stats":"Statistiques du site","our_admins":"Nos administrateurs","our_moderators":"Nos modérateurs","stat":{"all_time":"depuis toujours","last_7_days":"Les 7 derniers jours","last_30_days":"Les 30 derniers jours"},"like_count":"J'aime","topic_count":"Sujets","post_count":"Nombre de messages","user_count":"Nouveaux utilisateurs","active_user_count":"Utilisateurs actifs","contact":"Nous contacter","contact_info":"En cas de problème critique ou urgent sur ce site, veuillez nous contacter : %{contact_info}"},"bookmarked":{"title":"Signet","clear_bookmarks":"Vider signets","help":{"bookmark":"Cliquer pour ajouter le premier message de ce sujet à vos signets","unbookmark":"Cliquer pour retirer tous vos signets pour ce sujet"}},"bookmarks":{"not_logged_in":"désolé, vous devez être connecté pour ajouter des message dans vos signets","created":"vous avez ajouté ce message dans vos signets","not_bookmarked":"vous avez lu ce message; cliquez pour l'ajouter dans vos signets","last_read":"ceci est le dernier message que vous avez lu; cliquez pour l'ajouter dans vos signets","remove":"Retirer de vos signets","confirm_clear":"Êtes-vous sûr de vouloir effacer tous les signets de ce sujet?"},"topic_count_latest":{"one":"{{count}} sujet récent.","other":"{{count}} sujets récents."},"topic_count_unread":{"one":"{{count}} sujet non lu.","other":"{{count}} sujets non lus."},"topic_count_new":{"one":"{{count}} nouveau sujet.","other":"{{count}} nouveaux sujets."},"click_to_show":"Cliquez pour afficher.","preview":"prévisualiser","cancel":"annuler","save":"Sauvegarder les modifications","saving":"Sauvegarde en cours...","saved":"Sauvegardé !","upload":"Envoyer","uploading":"Envoi en cours...","uploading_filename":"Téléversement de {{filename}}...","uploaded":"Envoyé !","enable":"Activer","disable":"Désactiver","undo":"Annuler","revert":"Rétablir","failed":"Echec","switch_to_anon":"Mode anonyme","switch_from_anon":"Quitter le mode anonyme","banner":{"close":"Ignorer cette bannière.","edit":"Éditer cette bannière \u003e\u003e"},"choose_topic":{"none_found":"Aucun sujet trouvé.","title":{"search":"Rechercher un sujet par son nom, url ou id :","placeholder":"renseignez ici le titre du sujet"}},"queue":{"topic":"Sujet :","approve":"Approuver","reject":"Rejeter","delete_user":"Supprimer l'utilisateur","title":"Nécessite l'approbation","none":"Il n'y a pas de messages à vérifier.","edit":"Éditer","cancel":"Annuler","view_pending":"voir les messages en attente","has_pending_posts":{"one":"Ce sujet a \u003cb\u003e1\u003c/b\u003e message en attente de validation","other":"Ce sujet a \u003cb\u003e{{count}}\u003c/b\u003e messages en attente de validation"},"confirm":"Sauvegarder les modifications","delete_prompt":"Êtes-vous sûr de vouloir supprimer \u003cb\u003e%{username}\u003c/b\u003e ? Cela supprimera tous ses messages et bloquera son courriel et son adresse IP.","approval":{"title":"Ce message doit être approuvé.","description":"Votre nouveau message a bien été envoyé, mais il doit être approuvé par un modérateur avant d'apparaître publiquement. Merci de votre patience.","pending_posts":{"one":"Vous avez \u003cstrong\u003eun\u003c/strong\u003e message en attente.","other":"Vous avez \u003cstrong\u003e{{count}}\u003c/strong\u003e messages en attente."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e a démarré \u003ca href='{{topicUrl}}'\u003ele sujet\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eVous\u003c/a\u003e avez démarré \u003ca href='{{topicUrl}}'\u003ele sujet\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e a répondu à \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eVous\u003c/a\u003e avez répondu à \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e a répondu à \u003ca href='{{topicUrl}}'\u003ece sujet\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eVous\u003c/a\u003e avez répondu à \u003ca href='{{topicUrl}}'\u003ece sujet\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e a mentionné \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user2Url}}'\u003eVous\u003c/a\u003e avez été mentionné par \u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eVous\u003c/a\u003e avez mentionné \u003ca href='{{user2Url}}'\u003e{{user}}\u003c/a\u003e","posted_by_user":"Rédigé par \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Rédigé par \u003ca href='{{userUrl}}'\u003evous\u003c/a\u003e","sent_by_user":"Envoyé par \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Envoyé par \u003ca href='{{userUrl}}'\u003evous\u003c/a\u003e"},"directory":{"filter_name":"filtrer par pseudo","title":"Utilisateurs","likes_given":"Donnés","likes_received":"Reçus","topics_entered":"Visités","topics_entered_long":"Sujets visités","time_read":"Temps de lecture","topic_count":"Sujets","topic_count_long":"Sujets créés","post_count":"Réponses","post_count_long":"Réponses envoyés","no_results":"Aucun résultat n'a été trouvé.","days_visited":"Visites","days_visited_long":"Jours visités","posts_read":"Lus","posts_read_long":"Messages lus","total_rows":{"one":"1 utilisateur","other":"%{count} utilisateurs"}},"groups":{"add":"Ajouter","selector_placeholder":"Ajouter des membres","owner":"propriétaire","visible":"Ce groupe est visible par tous les utilisateurs","title":{"one":"groupe","other":"groupes"},"members":"Membres","posts":"Messages","alias_levels":{"title":"Qui peut utiliser ce groupe comme d'un alias pour les mentions ?","nobody":"Personne","only_admins":"Seulement les administrateurs ","mods_and_admins":"Seulement les modérateurs et les administrateurs ","members_mods_and_admins":"Seulement les membres du groupe, les modérateurs et les administrateurs ","everyone":"Tout le monde"},"trust_levels":{"title":"Niveau de confiance automatiquement attribué lorsque les membres sont ajoutés à :","none":"Aucun"}},"user_action_groups":{"1":"J'aime donnés","2":"J'aime reçus","3":"Signets","4":"Sujets","5":"Réponses","6":"Réponses","7":"Mentions","9":"Citations","10":"Favoris","11":"Editions","12":"Eléments envoyés","13":"Boîte de réception","14":"En attente"},"categories":{"all":"toutes les catégories","all_subcategories":"toutes","no_subcategory":"aucune","category":"Catégorie","reorder":{"title":"Réordonner les catégories","title_long":"Réorganiser la liste des catégories","fix_order":"Corriger les positions","fix_order_tooltip":"Toutes les catégories n'ont pas une position unique. Cela peut provoquer des résultats non souhaités.","save":"Enregistrer l'ordre","apply_all":"Appliquer","position":"Position"},"posts":"Messages","topics":"Sujets","latest":"Récents","latest_by":"dernièr sujet de","toggle_ordering":"modifier le mode du tri","subcategories":"Sous-catégories","topic_stats":"Le nombre de nouveaux sujets.","topic_stat_sentence":{"one":"%{count} nouveau sujet depuis %{unit}.","other":"%{count} nouveaux sujets depuis %{unit}."},"post_stats":"Le nombre de nouveaux messages.","post_stat_sentence":{"one":"%{count} nouveau message depuis %{unit}.","other":"%{count} nouveaux messages depuis %{unit}."}},"ip_lookup":{"title":"Rechercher l'adresse IP","hostname":"Nom de l'hôte","location":"Localisation","location_not_found":"(inconnu)","organisation":"Société","phone":"Téléphone","other_accounts":"Autres comptes avec cette adresse IP :","delete_other_accounts":"Supprimer %{count}","username":"pseudo","trust_level":"NC","read_time":"temps de lecture","topics_entered":"sujets visités","post_count":"# messages","confirm_delete_other_accounts":"Êtes-vous sûr de vouloir supprimer tous ces comptes ?"},"user_fields":{"none":"(choisir une option)"},"user":{"said":"{{username}} :","profile":"Profil","mute":"Silencieux","edit":"Modifier les préférences","download_archive":"Télécharger mes messages","new_private_message":"Nouveau message privé","private_message":"Message privé","private_messages":"Messages privés","activity_stream":"Activité","preferences":"Préférences","expand_profile":"Développer","bookmarks":"Signets","bio":"À propos de moi","invited_by":"Invité par","trust_level":"Niveau de confiance","notifications":"Notifications","desktop_notifications":{"label":"Notifications de bureau","not_supported":"Les notifications ne sont pas supportées avec ce navigateur. Désolé.","perm_default":"Activer les notifications","perm_denied_btn":"Permission Refusée","perm_denied_expl":"Vous avez refusé la permission pour les notifications. Utilisez votre navigateur pour activer les notifications, puis appuyez sur le bouton une fois terminé. (Bureau : L'icône la plus à gauche dans la barre d'adresse. Mobile : 'Info Site'.)","disable":"Désactiver les notifications","currently_enabled":"(activé actuellement)","enable":"Activer les notifications","currently_disabled":"(désactivé actuellement)","each_browser_note":"Note : Vous devez changer ce paramètre sur chaque navigateur que vous utilisez."},"dismiss_notifications":"Marquer tout comme lu","dismiss_notifications_tooltip":"Marquer comme lues toutes les notifications non lues","disable_jump_reply":"Ne pas se déplacer à mon nouveau message après avoir répondu","dynamic_favicon":"Faire apparaître le nombre de sujets récemment créés ou mis à jour sur l'icône navigateur","edit_history_public":"Autoriser les autres utilisateurs à consulter les modifications de mes messages.","external_links_in_new_tab":"Ouvrir tous les liens externes dans un nouvel onglet","enable_quoting":"Proposer la citation du texte surligné","change":"modifier","moderator":"{{user}} est un modérateur","admin":"{{user}} est un administrateur","moderator_tooltip":"Cet utilisateur est un modérateur","admin_tooltip":"Cet utilisateur est un admin","blocked_tooltip":"Cet utilisateur est bloqué.","suspended_notice":"L'utilisateur est suspendu jusqu'au {{date}}.","suspended_reason":"Raison :","github_profile":"Github","mailing_list_mode":"M'envoyer un courriel pour tous les nouveaux messages (sauf si vous avez rendu silencieux le sujet ou la catégorie)","watched_categories":"Surveillés","watched_categories_instructions":"Vous surveillerez automatiquement les nouveaux sujets de ces catégories. Vous serez averti de tous les nouveaux messages et sujets. De plus, le nombre de messages non lus apparaîtra en regard de la liste des sujets.","tracked_categories":"Suivies","tracked_categories_instructions":"Vous allez suivre automatiquement tous les nouveaux sujets dans ces catégories. Le nombre de nouveaux messages apparaîtra à côté du sujet.","muted_categories":"Désactivés","muted_categories_instructions":"Vous ne serez notifié de rien concernant les nouveaux sujets dans ces catégories, et elles n'apparaîtront pas dans les dernières catégories.","delete_account":"Supprimer mon compte","delete_account_confirm":"Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action ne peut être annulée !","deleted_yourself":"Votre compte a été supprimé avec succès.","delete_yourself_not_allowed":"Vous ne pouvez pas supprimer votre compte maintenant. Contactez un administrateur pour faire supprimer votre compte pour vous.","unread_message_count":"Messages","admin_delete":"Supprimer","users":"Utilisateurs","muted_users":"Silencieux","muted_users_instructions":"Cacher toutes les notifications de ces utilisateurs.","muted_topics_link":"Afficher les sujets en sourdine","automatically_unpin_topics":"Automatiquement désépingler les sujets lorsque vous atteignez le bas.","staff_counters":{"flags_given":"signalements utiles","flagged_posts":"messages signalés","deleted_posts":"messages supprimés","suspensions":"suspensions","warnings_received":"avertissements"},"messages":{"all":"Tous","mine":"Envoyés","unread":"Non lus"},"change_password":{"success":"(courriel envoyé)","in_progress":"(courriel en cours d'envoi)","error":"(erreur)","action":"Envoyer un courriel de réinitialisation du mot de passe","set_password":"Définir le mot de passe"},"change_about":{"title":"Modifier à propos de moi","error":"Il y a eu une erreur lors du changement de ce paramètre."},"change_username":{"title":"Modifier le pseudo","confirm":"Si vous modifiez votre pseudo, toutes les citations de vos messages et les mentions @pseudo seront cassées. Êtes-vous absolument sûr de vouloir le faire ?","taken":"Désolé, ce pseudo est déjà pris.","error":"Il y a eu une erreur lors du changement de votre pseudo.","invalid":"Ce pseudo est invalide. Il ne doit être composé que de lettres et de chiffres."},"change_email":{"title":"Modifier l'adresse de courriel","taken":"Désolé, cette adresse de courriel est indisponible.","error":"Il y a eu une erreur lors du changement d'adresse de courriel. Cette adresse est peut-être déjà utilisée ?","success":"Nous avons envoyé un courriel à cette adresse. Merci de suivre les instructions."},"change_avatar":{"title":"Modifier votre image de profil","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, basé sur","gravatar_title":"Modifier votre avatar sur le site de Gravatar","refresh_gravatar_title":"Actualiser votre Gravatar","letter_based":"Image de profil attribuée par le système","uploaded_avatar":"Avatar personnalisé","uploaded_avatar_empty":"Ajouter une avatar personnalisé","upload_title":"Envoyer votre avatar","upload_picture":"Envoyer une image","image_is_not_a_square":"Attention : nous avons découpé votre image; la largeur et la hauteur n'étaient pas égales.","cache_notice":"Votre photo de profil a bien été modifié, mais il se peut qu'il mette un certain temps à apparaître à cause des caches de navigateur."},"change_profile_background":{"title":"Arrière plan du profil","instructions":"L'arrière-plan du profil sera centré avec une largeur par défaut de 850 pixels."},"change_card_background":{"title":"Arrière plan de la carte de l'utilisateur","instructions":"Les images d'arrière plan seront centrées avec une taille par défaut de 590 pixels."},"email":{"title":"Courriel","instructions":"Ne sera jamais visible publiquement","ok":"On vous enverra un courriel pour confirmer","invalid":"Merci d'entrer une adresse de courriel valide","authenticated":"Votre adresse de courriel a été authentifiée par {{provider}}","frequency_immediately":"Nous vous enverrons un courriel immédiatement si vous n'avez pas lu le contenu en question.","frequency":{"one":"Nous vous enverrons des courriels seulement si nous ne vous avons pas vu sur le site dans la dernière minute.","other":"Nous vous enverrons des courriels seulement si nous ne vous avons pas vu sur le site dans les dernières {{count}} minutes."}},"name":{"title":"Nom d'utilisateur","instructions":"Votre nom complet (facultatif)","instructions_required":"Votre nom complet","too_short":"Votre nom est trop court","ok":"Votre nom a l'air bon."},"username":{"title":"Pseudo","instructions":"Unique, sans espace, court","short_instructions":"Les gens peuvent vous mentionner avec @{{username}}","available":"Votre pseudo est disponible","global_match":"L'adresse de courriel correspond au pseudo enregistré","global_mismatch":"Déjà enregistré. Essayez {{suggestion}} ?","not_available":"Non disponible. Essayez {{suggestion}} ?","too_short":"Votre pseudo est trop court","too_long":"Votre pseudo est trop long","checking":"Vérification de la disponibilité de votre pseudo...","enter_email":"Pseudo trouvé; Entrez l'adresse de courriel correspondante","prefilled":"L'adresse de courriel correspond à ce pseudo enregistré"},"locale":{"title":"Langue de l'interface","instructions":"Langue de votre interface.  Cette dernière changera lorsque vous actualiserez la page.","default":"(par défaut)"},"password_confirmation":{"title":"Confirmation du mot de passe"},"last_posted":"Dernier message","last_emailed":"Dernier courriel","last_seen":"Vu","created":"Inscrit","log_out":"Se déconnecter","location":"Localisation","card_badge":{"title":"Badge pour la carte de l'utilisateur"},"website":"Site internet","email_settings":"Courriel","email_digests":{"title":"Quand je ne visite pas ce site, m'envoyer un résumé des nouveautés par courriel:","daily":"quotidien","every_three_days":"tous les trois jours","weekly":"hebdomadaire","every_two_weeks":"toutes les deux semaines"},"email_direct":"M'envoyer un courriel quand quelqu'un me cite, répond à mon message ou mentionne mon @pseudo ou m'invite à rejoindre un sujet","email_private_messages":"M'envoyer un courriel quand quelqu'un m'envoie un message privé","email_always":"Recevoir des notifications par email même lorsque je suis actif sur le site","other_settings":"Autre","categories_settings":"Catégories","new_topic_duration":{"label":"Considérer les sujets comme nouveau quand","not_viewed":"Je ne les ai pas encore vus","last_here":"crées depuis ma dernière visite","after_1_day":"créés depuis hier","after_2_days":"créés durant les 2 derniers jours","after_1_week":"créés durant les 7 derniers jours","after_2_weeks":"créés durant les 2 dernières semaines"},"auto_track_topics":"Suivre automatiquement les sujets que je consulte","auto_track_options":{"never":"jamais","immediately":"immédiatement","after_30_seconds":"après 30 secondes","after_1_minute":"après 1 minute","after_2_minutes":"après 2 minutes","after_3_minutes":"après 3 minutes","after_4_minutes":"après 4 minutes","after_5_minutes":"après 5 minutes","after_10_minutes":"après 10 minutes"},"invited":{"search":"commencer à saisir pour rechercher vos invitations...","title":"Invitations","user":"Utilisateurs","sent":"Envoyé","none":"Il n'y a plus d'invitation en attente à afficher.","truncated":{"one":"Afficher la première invitation.","other":"Afficher les {{count}} premières invitations."},"redeemed":"Invitations acceptées","redeemed_tab":"Utilisés","redeemed_tab_with_count":"Invitations acceptées ({{count}})","redeemed_at":"Acceptée le","pending":"Invitations en attente","pending_tab":"En attente","pending_tab_with_count":"En attente ({{count}})","topics_entered":"Sujets consultés","posts_read_count":"Messages lus","expired":"Cette invitation a expirée.","rescind":"Supprimer","rescinded":"Invitation annulée","reinvite":"Envoyer de nouveau l'invitation","reinvited":"Invitation renvoyée","time_read":"Temps de lecture","days_visited":"Ratio de présence","account_age_days":"Âge du compte en jours","create":"Envoyer une invitation","generate_link":"Copier le lien d'invitation","generated_link_message":"\u003cp\u003eLe lien d'invitation a été généré avec succès !\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eLe lien d'invitation est valide uniquement pour cette adresse : \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Vous n'avez encore invité personne. Vous pouvez envoyé des invitations individuelles, ou en masse en \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eenvoyant un fichier d'invitation contenant la liste des courriels\u003c/a\u003e.","text":"Invitation massive depuis un fichier","uploading":"Envoi en cours...","success":"Le fichier a été correctement importé. Vous serez averti par message privé lorsque le traitement sera terminé.","error":"Il y a eu une erreur lors de l'envoi de '{{filename}}': {{message}}"}},"password":{"title":"Mot de passe","too_short":"Votre mot de passe est trop court.","common":"Ce mot de passe est trop commun.","same_as_username":"Votre mot de passe est le même que votre pseudo.","same_as_email":"Votre mot de passe est le même que votre adresse mail.","ok":"Votre mot de passe semble correct.","instructions":"Au moins %{count} caractères."},"associated_accounts":"Connexions","ip_address":{"title":"Dernières adresses IP"},"registration_ip_address":{"title":"Adresse IP d'enregistrement"},"avatar":{"title":"Image de profil","header_title":"profil, messages, favoris et préférences"},"title":{"title":"Titre"},"filters":{"all":"Tous"},"stream":{"posted_by":"Rédigé par","sent_by":"Envoyé par","private_message":"message privé","the_topic":"le sujet"}},"loading":"Chargement…","errors":{"prev_page":"lors d'une tentative de chargement","reasons":{"network":"Erreur réseau","server":"Erreur serveur","forbidden":"Accès refusé","unknown":"Erreur","not_found":"Page introuvable"},"desc":{"network":"Veuillez vérifier votre connexion.","network_fixed":"On dirait que c'est revenu.","server":"Code d'erreur: {{status}}","forbidden":"Vous n'êtes pas autorisé à voir cela.","not_found":"Oups, l'application a essayé de charger une URL qui n'existe pas.","unknown":"Une erreur est survenue."},"buttons":{"back":"Retour","again":"Réessayer","fixed":"Charger la page"}},"close":"Fermer","assets_changed_confirm":"Ce site vient d'être mis à jour. Rafraîchir maintenant pour accéder à la nouvelle version ?","logout":"Vous avez été déconnecté","refresh":"Rafraîchir","read_only_mode":{"enabled":"Le mode lecture seule est activé. Vous pouvez continuer à naviguer sur le site, mais ne pouvez pas prendre part aux discussions.","login_disabled":"Impossible de se connecté quand le site est en mode lecture seule."},"too_few_topics_and_posts_notice":"\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eDémarrons cette discussion!\u003c/a\u003e Il y a actuellement \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e sujets et \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e messages. Les nouveaux visiteurs ont besoin de quelques conversations pour lire et répondre.","too_few_topics_notice":"\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eDémarrons cette discussion !\u003c/a\u003e Il y a actuellement \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e sujets. Les nouveaux visiteurs ont besoin de quelques conversations à lire et répondre.","too_few_posts_notice":"\u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eDémarrons cette discussion !\u003c/a\u003e Il y a actuellement \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e messages. Les nouveaux visiteurs ont besoin de quelques conversations à lire et répondre.","learn_more":"en savoir plus…","year":"an","year_desc":"sujets créés durant les 365 derniers jours","month":"mois","month_desc":"sujets créés durant les 30 derniers jours","week":"semaine","week_desc":"sujets créés durant les 7 derniers jours","day":"jour","first_post":"Premier message","mute":"Désactiver","unmute":"Activer","last_post":"Dernier message","last_reply_lowercase":"dernière réponse","replies_lowercase":{"one":"réponse","other":"réponses"},"signup_cta":{"sign_up":"S'inscrire","hide_session":"Me le rappeler demain.","hide_forever":"non merci","hidden_for_session":"Très bien, je vous proposerai demain. Vous pouvez toujours cliquer sur 'Se connecter' pour créer un compte.","intro":"Bonjour! :heart_eyes: Vous semblez apprécier la discussion, mais n'avez pas encore créé de compte.","value_prop":"Quand vous créez votre compte, nous stockons ce que vous avez lu pour vous positionner systématiquement sur le bon emplacement à votre retour. Vous  avez également des notifications, ici et par courriel, quand de nouveaux messages sont postés. Et vous pouvez aimer les messages pour partager vos coups de cœurs. :heartbeat:"},"summary":{"enabled_description":"Vous visualisez un résumé de ce sujet : les messages importants choisis par la communauté.","description":"Il y a \u003cb\u003e{{count}}\u003c/b\u003e réponses.","description_time":"Il y a \u003cb\u003e{{count}}\u003c/b\u003e réponses avec un temps estimé de lecture de \u003cb\u003e{{readingTime}} minutes\u003c/b\u003e.","enable":"Résumer ce sujet","disable":"Afficher tous les messages"},"deleted_filter":{"enabled_description":"Ce sujet contient des messages supprimés, qui ont été cachés.","disabled_description":"Les messages supprimés de ce sujet sont visibles.","enable":"Cacher les messages supprimés","disable":"Afficher les messages supprimés"},"private_message_info":{"title":"Message privé","invite":"Inviter d'autres utilisateurs…","remove_allowed_user":"Êtes-vous sûr de vouloir supprimer {{name}} de ce message privé?"},"email":"Courriel","username":"Pseudo","last_seen":"Vu","created":"Créé","created_lowercase":"créé","trust_level":"Niveau de confiance","search_hint":"pseudo, courriel ou adresse IP","create_account":{"title":"Créer un nouveau compte","failed":"Quelque chose s'est mal passé, peut-être que cette adresse de courriel est déjà enregistrée, essayez le lien Mot de passe oublié."},"forgot_password":{"title":"Réinitialisation du mot de passe","action":"J'ai oublié mon mot de passe","invite":"Saisir votre pseudo ou votre adresse de courriel, et vous recevrez un nouveau mot de passe par courriel.","reset":"Réinitialiser votre mot de passe","complete_username":"Si un compte correspond au pseudo \u003cb\u003e%{username}\u003c/b\u003e, vous devriez recevoir rapidement un courriel avec les instructions pour réinitialiser votre mot de passe.","complete_email":"Si un compte correspond à l'adresse de courriel \u003cb\u003e%{email}\u003c/b\u003e, vous devriez recevoir rapidement un courriel avec les instructions pour réinitialiser votre mot de passe.","complete_username_found":"Nous avons trouvé un compte correspond au pseudo \u003cb\u003e%{username}\u003c/b\u003e, vous devriez recevoir rapidement un courriel avec les instructions pour réinitialiser votre mot de passe.","complete_email_found":"Nous avons trouvé un compte correspond au courriel \u003cb\u003e%{email}\u003c/b\u003e, vous devriez recevoir rapidement un courriel avec les instructions pour réinitialiser votre mot de passe.","complete_username_not_found":"Aucun compte ne correspond au pseudo \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Aucun compte ne correspond à \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Se connecter","username":"Utilisateur","password":"Mot de passe","email_placeholder":"courriel ou pseudo","caps_lock_warning":"Majuscules vérrouillées","error":"Erreur inconnue","rate_limit":"Merci de patienter avant de vous reconnecter.","blank_username_or_password":"Merci de saisir votre courriel ou pseudo, et mot de passe.","reset_password":"Réinitialiser le mot de passe","logging_in":"Connexion en cours…","or":"ou","authenticating":"Authentification…","awaiting_confirmation":"Votre compte est en attente d'activation, utilisez le lien mot de passe oublié pour demander un nouveau courriel d'activation.","awaiting_approval":"Votre compte n'a pas encore été approuvé par un modérateur. Vous recevrez une confirmation par courriel lors de l'activation.","requires_invite":"Désolé, l'accès à ce forum est sur invitation seulement.","not_activated":"Vous ne pouvez pas vous encore vous connecter. Nous avons envoyé un courriel d'activation à \u003cb\u003e{{sentTo}}\u003c/b\u003e. Merci de suivre les instructions afin d'activer votre compte.","not_allowed_from_ip_address":"Vous ne pouvez pas vous connecter depuis cette adresse IP.","admin_not_allowed_from_ip_address":"Vous ne pouvez pas vous connecter comme administrateur depuis cette adresse IP.","resend_activation_email":"Cliquez ici pour envoyer à nouveau le courriel d'activation.","sent_activation_email_again":"Nous venons d'envoyer un nouveau courriel d'activation à \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Il peut prendre quelques minutes à arriver; n'oubliez pas de vérifier votre répertoire spam.","to_continue":"Veuillez vous connecter","preferences":"Vous devez être connecté pour modifier vos préférences utilisateur.","forgot":"J'ai oublié les détails de mon compte","google":{"title":"via Google","message":"Authentification via Google (assurez-vous que les popups ne soient pas bloquées)"},"google_oauth2":{"title":"via Google","message":"Authentification via Google (assurez-vous que les popups ne soient pas bloquées)"},"twitter":{"title":"via Twitter","message":"Authentification via Twitter (assurez-vous que les popups ne soient pas bloquées)"},"facebook":{"title":"via Facebook","message":"Authentification via Facebook (assurez-vous que les popups ne soient pas bloquées)"},"yahoo":{"title":"via Yahoo","message":"Authentification via Yahoo (assurez-vous que les popups ne soient pas bloquées)"},"github":{"title":"via GitHub","message":"Authentification via GitHub (assurez-vous que les popups ne soient pas bloquées)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"plus...","options":"Options","whisper":"murmure","add_warning":"Ceci est un avertissement officiel.","toggle_whisper":"Activer/Désactiver Whisper","posting_not_on_topic":"À quel sujet voulez-vous répondre ?","saving_draft_tip":"sauvegarde en cours...","saved_draft_tip":"sauvegardé","saved_local_draft_tip":"sauvegardé en local","similar_topics":"Votre message est similaire à...","drafts_offline":"sauvegardé hors ligne","error":{"title_missing":"Le titre est obligatoire.","title_too_short":"Le titre doit avoir au moins {{min}} caractères","title_too_long":"Le titre ne doit pas dépasser les {{max}} caractères","post_missing":"Le message ne peut être vide","post_length":"Le message doit avoir au moins {{min}} caractères","try_like":"Avez-vous essayé le bouton \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e ?","category_missing":"Vous devez choisir une catégorie"},"save_edit":"Sauvegarder la modification","reply_original":"Répondre sur le sujet d'origine","reply_here":"Répondre ici","reply":"Répondre","cancel":"Annuler","create_topic":"Créer un sujet","create_pm":"Message privé","title":"ou appuyez sur Ctrl+Entrée","users_placeholder":"Ajouter un utilisateur","title_placeholder":"Quel est votre sujet en une phrase descriptive ?","edit_reason_placeholder":"pourquoi éditez-vous ?","show_edit_reason":"(ajouter la raison de l'édition)","reply_placeholder":"Écrivez ici. Utilisez Markdown, BBCode, ou HTML pour formatter. Glissez ou collez des images.","view_new_post":"Voir votre nouveau message.","saving":"Sauvegarde","saved":"Sauvegardé !","saved_draft":"Vous avez un message brouillon en cours. Sélectionner cette barre pour reprendre son édition.","uploading":"Envoi en cours…","show_preview":"afficher la prévisualisation \u0026raquo;","hide_preview":"\u0026laquo; cacher la prévisualisation","quote_post_title":"Citer le message en entier","bold_title":"Gras","bold_text":"texte en gras","italic_title":"Italique","italic_text":"texte en italique","link_title":"Lien","link_description":"saisir ici la description du lien","link_dialog_title":"Insérez le lien","link_optional_text":"titre optionnel","link_placeholder":"http://exemple.fr \"texte facultatif\"","quote_title":"Citation","quote_text":"Citation","code_title":"Texte préformaté","code_text":"texte préformaté indenté par 4 espaces","upload_title":"Envois de fichier","upload_description":"saisir ici la description de votre fichier","olist_title":"Liste numérotée","ulist_title":"Liste à puces","list_item":"Élément","heading_title":"Titre","heading_text":"Titre","hr_title":"Barre horizontale","help":"Aide Markdown","toggler":"Afficher ou cacher le composer","modal_ok":"OK","modal_cancel":"Annuler","cant_send_pm":"Désolé, vous ne pouvez pas envoyer de message à l'utilisateur %{username}.","admin_options_title":"Paramètres optionnels pour ce sujet","auto_close":{"label":"Heure de fermeture automatique de ce sujet :","error":"Merci d'entrer une valeur valide.","based_on_last_post":"Ne pas fermer tant que le dernier message dans ce sujet n'est pas plus ancien que ceci.","all":{"examples":"Saisir un nombre d'heures (24), une heure absolue (17:30) ou une date (2013-11-22 14:00)."},"limited":{"units":"(# d'heures)","examples":"Saisir le nombre d'heures (24)."}}},"notifications":{"title":"notifications des mentions de votre @pseudo, des réponses à vos messages, à vos sujets, etc.","none":"Actuellement il est impossible de montrer les notifications.","more":"voir les anciennes notifications","total_flagged":"Nombre total de messages signalés","mentioned":"\u003ci title='mentionné' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='cité' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='avec réponse' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='avec réponse' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='édité' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='aimé' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='message privé' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='message privé' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invité' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='invitation accepté' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e a accepté votre invitation\u003c/p\u003e","moved_post":"\u003ci title='message déplacé' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e a déplacé {{description}}\u003c/p\u003e","linked":"\u003ci title='message lié' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge décerné' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eVous avez gagné {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentionné par","quoted":"Cité par","replied":"Répondu","posted":"Message par","edited":"Editer votre message par","liked":"Aime votre message","private_message":"Message privé de","invited_to_private_message":"Invité pour un message privé par","invited_to_topic":"Invité à un sujet par","invitee_accepted":"Invitation acceptée par","moved_post":"Votre message a été déplacé par","linked":"Lien vers votre message","granted_badge":"Badge attribué"},"popup":{"mentioned":"{{username}} vous a mentionné dans «{{topic}}» - {{site_title}}","quoted":"{{username}} vous a cité dans «{{topic}}» - {{site_title}}","replied":"{{username}} vous a répondu dans «{{topic}}» - {{site_title}}","posted":"{{username}} a posté dans «{{topic}}» - {{site_title}}","private_message":"{{username}} vous a envoyé un message direct «{{topic}}» - {{site_title}}","linked":"{{username}} a créé un lien vers votre message posté dans «{{topic}}» - {{site_title}}"}},"upload_selector":{"title":"Ajouter une image","title_with_attachments":"Ajouter une image ou un fichier","from_my_computer":"Depuis mon appareil","from_the_web":"Depuis le web","remote_tip":"lien vers l'image","remote_tip_with_attachments":"lien vers l'image ou le fichier {{authorized_extensions}}","local_tip":"sélectionnez des images depuis votre appareil","local_tip_with_attachments":"sélectionnez des images ou des fichiers depuis votre appareil {{authorized_extensions}}","hint":"(vous pouvez également faire un glisser-déposer dans l'éditeur pour les télécharger)","hint_for_supported_browsers":"vous pouvez aussi glisser/déposer ou coller des images dans l'éditeur","uploading":"Fichier en cours d'envoi","select_file":"Sélectionner Fichier","image_link":"lien vers lequel pointe l'image"},"search":{"sort_by":"Trier par","relevance":"Pertinence","latest_post":"Dernier Message","most_viewed":"Plus Vu","most_liked":"Plus Aimé","select_all":"Sélectionner tout","clear_all":"Supprimer tout","result_count":{"one":"1 résultat pour \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} résultats pour \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"Rechercher les sujets, messages, utilisateurs ou catégories","no_results":"Aucun résultat.","no_more_results":"Pas davantage de résultats.","search_help":"Aide pour la recherche","searching":"Recherche en cours…","post_format":"#{{post_number}} par {{username}}","context":{"user":"Chercher dans les messages de @{{username}}","category":"Rechercher dans la catégorie \"{{category}}\"","topic":"Rechercher dans ce sujet","private_messages":"Rechercher des messages"}},"hamburger_menu":"se rendre dans une autre liste de sujet ou catégorie","new_item":"nouveau","go_back":"retour","not_logged_in_user":"page utilisateur avec un résumé de l'activité en cours et les préférences ","current_user":"voir la page de l'utilisateur","topics":{"bulk":{"unlist_topics":"Ne plus lister les sujets","reset_read":"Réinitialiser la lecture","delete":"Supprimer les sujets","dismiss":"Ignorer","dismiss_read":"Ignorer tous les sujets non-lus","dismiss_button":"Ignorer...","dismiss_tooltip":"Ignorer les nouveaux messages ou arrêter des suivre les sujets","also_dismiss_topics":"Arrêter de suivre ces sujets ? (Ces sujets n'apparaîtront plus dans votre onglet Non lus).","dismiss_new":"Ignorer Nouveaux","toggle":"activer la sélection multiple des sujets","actions":"Actions sur sélection multiple","change_category":"Modifier la Catégorie","close_topics":"Fermer les sujets","archive_topics":"Sujets archivés","notification_level":"Modifier le niveau de notification","choose_new_category":"Choisissez la nouvelle catégorie pour les sujets :","selected":{"one":"Vous avez sélectionné \u003cb\u003e1\u003c/b\u003e sujet.","other":"Vous avez sélectionné \u003cb\u003e{{count}}\u003c/b\u003e sujets."}},"none":{"unread":"Vous n'avez aucun sujet non lu.","new":"Vous n'avez aucun nouveau sujet.","read":"Vous n'avez lu aucun sujet pour le moment.","posted":"Vous n'avez écrit aucun message pour le moment.","latest":"Il n'y a aucun sujet pour le moment. C'est triste...","hot":"Il n'y a aucun sujet populaire pour le moment.","bookmarks":"Vous n'avez pas encore ajouté de sujet à vos signets","category":"Il n'y a aucun sujet sur {{category}}.","top":"Il n'y a pas de meilleurs sujets.","search":"Votre recherche ne retourne aucun résultat.","educate":{"new":"\u003cp\u003eVos nouveaux sujets apparaissent ici\u003c/p\u003e\u003cp\u003ePar défaut, les sujets sont considérés comme nouveau et affiche l'indicateur \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enouveau\u003c/span\u003e lorsqu'ils ont été crées dans les deux derniers jours.\u003c/p\u003e\u003cp\u003e\nVous pouvez modifier cela dans vos \u003ca href=\"%{userPrefsUrl}\"\u003epréférences\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eVos sujets non-lus apparaissent ici\u003c/p\u003e\u003cp\u003ePar défaut, les sujets sont considérés comme non-lus et affichent le nombre de messages non-lus \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e sont ceux:\u003c/p\u003e\n\u003cul\u003e\u003cli\u003eQue vous avez crées\u003c/li\u003e\u003cli\u003eAuxquels vous avez répondu\u003c/li\u003e\u003cli\u003eQue vous avez lu plus de 4 minutes\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOu que vous avez explicitement suivis ou surveillés\u003c/p\u003e\u003cp\u003eVous pouvez modifier cela dans vos \u003ca href=\"%{userPrefsUrl}\"\u003epréférences\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Il n'y a plus de sujet à lire.","hot":"Il n'y a plus de sujet populaire à lire.","posted":"Il n'y a plus de sujet à lire.","read":"Il n'y a plus de sujet à lire.","new":"Il n'y a plus de nouveau sujet.","unread":"Il n'y a plus de sujet à lire.","category":"Il n'y a plus de sujet sur {{category}} à lire.","top":"Il n'y a plus de meilleurs sujets.","bookmarks":"Il n'y a plus de sujets dans vos signets.","search":"Il n'y a plus de résultats à votre recherche."}},"topic":{"unsubscribe":{"stop_notifications":"Vous recevrez moins de notifications pour \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Votre statut de notification est"},"filter_to":"{{post_count}} messages sur ce sujet","create":"Créer votre sujet","create_long":"Créer un nouveau sujet","private_message":"Écrire un message","list":"Sujets","new":"nouveau sujet","unread":"non-lus","new_topics":{"one":"1 nouveau sujet","other":"{{count}} nouveaux sujets"},"unread_topics":{"one":"1 sujet non lu","other":"{{count}} sujets non lus"},"title":"Sujet","invalid_access":{"title":"Ce sujet est privé","description":"Désolé, vous n'avez pas accès à ce sujet !","login_required":"Vous devez vous connecter pour voir ce sujet de discussion."},"server_error":{"title":"Sujet impossible à charger","description":"Désolé, nous n'avons pu charger ce sujet, probablement du à un problème de connexion. Merci de réessayer à nouveau. Si le problème persiste, merci de nous le faire savoir."},"not_found":{"title":"Sujet non trouvé","description":"Désolé, nous n'avons pas trouvé ce sujet. Peut-être a t-il été retiré par un modérateur ?"},"total_unread_posts":{"one":"vous avez 1 message non-lu dans ce sujet","other":"vous avez {{count}} messages non-lus dans ce sujet"},"unread_posts":{"one":"vous avez 1 message non lu sur ce sujet","other":"vous avez {{count}} messages non lus sur ce sujet"},"new_posts":{"one":"il y a 1 nouveau message sur ce sujet depuis votre derniere lecture","other":"il y a {{count}} nouveaux messages sur ce sujet depuis votre derniere lecture"},"likes":{"one":"1 personne a aimé ce sujet","other":"{{count}} personnes ont aimés ce sujet"},"back_to_list":"Retour à la liste des sujets","options":"Options du sujet","show_links":"afficher les liens dans ce sujet","toggle_information":"afficher les détails de ce sujet","read_more_in_category":"Vous voulez en lire plus ? Afficher d'autres sujets dans {{catLink}} ou {{latestLink}}.","read_more":"Vous voulez en lire plus? {{catLink}} or {{latestLink}}.","browse_all_categories":"Voir toutes les catégories","view_latest_topics":"voir les derniers sujets","suggest_create_topic":"Pourquoi ne pas créer votre sujet ?","jump_reply_up":"aller à des réponses précédentes","jump_reply_down":"allez à des réponses ultérieures","deleted":"Ce sujet a été supprimé","auto_close_notice":"Ce sujet sera automatiquement fermé %{timeLeft}.","auto_close_notice_based_on_last_post":"Ce sujet sera fermé %{duration} après la dernière réponse.","auto_close_title":"Paramètres de fermeture automatique","auto_close_save":"Sauvegarder","auto_close_remove":"Ne pas fermer automatiquement ce sujet","progress":{"title":"progression dans le sujet","go_top":"haut","go_bottom":"bas","go":"aller","jump_bottom":"aller au dernier message","jump_bottom_with_number":"aller au message %{post_number}","total":"total messages","current":"message courant","position":"message %{current} sur %{total}"},"notifications":{"reasons":{"3_6":"Vous recevrez des notifications parce que vous surveillez cette catégorie.","3_5":"Vous recevrez des notifications parce que vous avez commencé à surveiller ce sujet automatiquement.","3_2":"Vous recevrez des notifications car vous surveillez ce sujet.","3_1":"Vous recevrez des notifications car vous avez créé ce sujet.","3":"Vous recevrez des notifications car vous surveillez ce sujet.","2_8":"Vous recevrez des notifications parce que vous suivez cette catégorie.","2_4":"Vous recevrez des notifications car vous avez écrit une réponse dans ce sujet.","2_2":"Vous recevrez des notifications car vous suivez ce sujet.","2":"Vous recevrez des notifications car vous \u003ca href=\"/users/{{username}}/preferences\"\u003eavez lu ce sujet\u003c/a\u003e.","1_2":"Vous serez averti si quelqu'un mentionne votre @pseudo ou vous répond.","1":"Vous serez averti si quelqu'un mentionne votre @pseudo ou vous répond.","0_7":"Vous ignorez toutes les notifications de cette catégorie.","0_2":"Vous ignorez toutes les notifications de ce sujet.","0":"Vous ignorez toutes les notifications de ce sujet."},"watching_pm":{"title":"Suivre attentivement","description":"Vous serez notifié de chaque nouvelle réponse dans ce message, et le nombre de nouvelles réponses apparaîtra."},"watching":{"title":"Surveiller","description":"Vous serez notifié de chaque nouvelle réponse dans ce sujet, et le nombre de nouvelles réponses apparaîtra."},"tracking_pm":{"title":"Suivi simple","description":"Le nombre de nouvelles réponses apparaîtra pour ce message. Vous serez notifié si quelqu'un mentionne votre @pseudo ou vous répond."},"tracking":{"title":"Suivi","description":"Le nombre de nouvelles réponses apparaîtra pour ce sujet. Vous serez notifié si quelqu'un mentionne votre @pseudo ou vous répond."},"regular":{"title":"Normal","description":"Vous serez notifié si quelqu'un mentionne votre @pseudo ou vous répond."},"regular_pm":{"title":"Normal","description":"Vous serez notifié si quelqu'un mentionne votre @pseudo ou vous répond."},"muted_pm":{"title":"Silencieux","description":"Vous ne serez jamais averti de quoi que ce soit à propos de ce message."},"muted":{"title":"Silencieux","description":"Vous ne serez jamais notifié de rien concernant ce sujet, et il n'apparaîtra pas des les derniers sujets."}},"actions":{"recover":"Annuler Suppression Sujet","delete":"Supprimer Sujet","open":"Ouvrir Sujet","close":"Fermer le sujet","multi_select":"Sélectionner les messages...","auto_close":"Fermeture automatique...","pin":"Épingler la discussion...","unpin":"Désépingler la discussion...","unarchive":"Désarchiver le sujet","archive":"Archiver le sujet","invisible":"Retirer de la liste des sujets","visible":"Afficher dans la liste des sujets","reset_read":"Réinitialiser les lectures"},"feature":{"pin":"Épingler la discussion","unpin":"Désépingler la discussion","pin_globally":"Épingler le sujet globalement","make_banner":"Bannière de sujet","remove_banner":"Retirer la bannière de sujet"},"reply":{"title":"Répondre","help":"commencez à répondre à ce sujet"},"clear_pin":{"title":"Désépingler","help":"Supprimer l'épingle ce sujet afin qu'il n'apparaisse plus en tête de votre liste de sujet"},"share":{"title":"Partager","help":"partager ce sujet"},"flag_topic":{"title":"Signaler","help":"signaler secrètement ce sujet pour attirer l'attention ou envoyer une notification privée à son propos.","success_message":"Vous avez signalé ce sujet avec succès."},"feature_topic":{"title":"Mettre ce sujet en évidence","pin":"Faire apparaître ce sujet en haut de la catégorie {{categoryLink}} jusqu'à","confirm_pin":"Vous avez déjà {{count}} sujets épinglés. S'il y a trop de sujets épinglés cela peut être lourd pour les nouveaux utilisateurs et utilisateurs anonymes. Êtes-vous sûr de vouloir ajouter un nouveau sujet épinglé dans cette catégorie?","unpin":"Enlever ce sujet du haut de la catégorie {{categoryLink}}.","unpin_until":"Enlever ce sujet du haut de la catégorie {{categoryLink}} ou attendre jusqu'à \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Les utilisateurs peuvent enlever l'épingle de ce sujet eux-mêmes.","pin_validation":"Une date est requise pour épingler ce sujet.","not_pinned":"Aucun sujet actuellement épinglé dans {{categoryLink}}.","already_pinned":{"one":"Sujets actuellement épinglés dans  {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Sujets actuellement épinglés dans  {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Faire apparaître ce sujet en haut de toutes les listes de sujet jusqu'à ","confirm_pin_globally":"Vous avez déjà {{count}} sujets épinglés globalement. S'il y a trop de sujets épinglés cela peut être lourd pour les nouveaux utilisateurs et les utilisateurs anonymes. Êtes-vous sûr de vouloir rajouter une sujet épinglé globalement?","unpin_globally":"Enlever ce sujet du haut de toutes les listes de sujet.","unpin_globally_until":"Enlever ce sujet du haut de toutes les listes de sujet ou attendre jusqu'à \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Les utilisateurs peuvent enlever l'épingle du sujet individuellement.","not_pinned_globally":"Aucun sujet épinglé globalement.","already_pinned_globally":{"one":"Sujets actuellement épinglés globalement : \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Sujets actuellement épinglés globalement : \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Transformer ce sujet en gros titre qui apparaît en haut de chaque page.","remove_banner":"Enlever le gros titre qui apparaît en haut de chaque page.","banner_note":"Les utilisateurs peuvent fermer le gros titre. Seul un sujet peut être mis en gros titre à la fois.","no_banner_exists":"Il n'y a pas actuellement de sujet en gros titre.","banner_exists":"Il y \u003cstrong class='badge badge-notification unread'\u003ea\u003c/strong\u003e actuellement un sujet en gros titre."},"inviting":"Invitation en cours…","automatically_add_to_groups_optional":"Cette invitation inclus l'accès à ces groupes: (optionnel, administrateur uniquement)","automatically_add_to_groups_required":"Cette invitation inclus l'accès à ces groupes: (\u003cb\u003eRequis\u003c/b\u003e, administrateur uniquement)","invite_private":{"title":"Inviter dans la discussion","email_or_username":"Adresse de courriel ou @pseudo de l'invité","email_or_username_placeholder":"adresse de courriel ou @pseudo","action":"Inviter","success":"Nous avons invité cet utilisateur à participer à cette discussion.","error":"Désolé, il y a eu une erreur lors de l'invitation de cet utilisateur.","group_name":"nom du groupe"},"invite_reply":{"title":"Inviter","username_placeholder":"pseudo","action":"Envoyer une invitation","help":"inviter d'autres personnes sur ce sujet par email ou notifications","to_forum":"Nous allons envoyer un courriel à votre ami pour lui permettre de participer au forum juste en cliquant sur un lien, sans qu'il ait à se connecter.","sso_enabled":"Entrez le nom d'utilisateur de la personne que vous souhaitez inviter sur ce sujet.","to_topic_blank":"Entrez le pseudo ou l'adresse email de la personne que vous souhaitez inviter sur ce sujet.","to_topic_email":"Vous avez entré une adresse email. Nous allons envoyer une invitation à votre ami lui permettant de répondre immédiatement à ce sujet.","to_topic_username":"Vous avez entré un nom d'utilisateur. Nous allons envoyer une notification avec un lien les invitant sur ce sujet.","to_username":"Entrez le nom d'utilisateur de la personne que vous souhaitez inviter. Nous enverrons une notification avec un lien les invitant sur ce sujet.","email_placeholder":"nom@exemple.com","success_email":"Nous avons envoyé un email à \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Nous vous avertirons lorsqu'il aura répondu à votre invitation. Suivez l'état de vos invitations dans l'onglet prévu à cet effet sur votre page utilisateur.","success_username":"Nous avons invité cet utilisateur à participer à ce sujet.","error":"Désolé, nous n'avons pas pu inviter cette personne. Elle a peut-être déjà été invitée ? (Le nombre d'invitations est limité)"},"login_reply":"Se connecter pour répondre","filters":{"n_posts":{"one":"1 message","other":"{{count}} messages"},"cancel":"Supprimer le filtre"},"split_topic":{"title":"Déplacer vers Nouveau Sujet","action":"déplacer vers un nouveau sujet","topic_name":"Titre du nouveau sujet","error":"Il y a eu une erreur en déplaçant les messages vers un nouveau sujet.","instructions":{"one":"Vous êtes sur le point de créer un nouveau sujet avec le message que vous avez sélectionné.","other":"Vous êtes sur le point de créer un nouveau sujet avec les \u003cb\u003e{{count}}\u003c/b\u003e messages que vous avez sélectionné."}},"merge_topic":{"title":"Déplacer vers Sujet Existant","action":"déplacer vers un sujet existant","error":"Il y a eu une erreur en déplaçant ces messages dans ce sujet.","instructions":{"one":"Merci de sélectionner le sujet dans laquelle vous souhaitez déplacer le message que vous avez sélectionné.","other":"Merci de sélectionner le sujet dans laquelle vous souhaitez déplacer les \u003cb\u003e{{count}}\u003c/b\u003e messages que vous avez sélectionné."}},"change_owner":{"title":"Modifier l'auteur des messages","action":"modifier l'auteur","error":"Il y a eu une erreur durant le changement d'auteur.","label":"Nouvel auteur des messages","placeholder":"pseudo du nouvel auteur","instructions":{"one":"Veuillez choisir un nouvel auteur pour le message de \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Veuillez choisir un nouvel auteur pour les {{count}} messages de \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Aucune notification à propos de ce message ne seront transféré rétroactivement à ce nouvel auteur. \u003cbr\u003eAttention: Actuellement, aucune donnée lié au message n'est transféré vers le nouvel auteur. À utiliser avec précaution."},"change_timestamp":{"title":"Modifier la date/heure","action":"modifier la date/heure","invalid_timestamp":"La date/heure ne peut être dans le futur","error":"Il y a eu une erreur lors de la modification de la date/heure de ce sujet.","instructions":"Veuillez sélectionner la nouvelle date/heure du sujet. Les messages dans ce topic seront mis à jour pour maintenir la même différence d'heure."},"multi_select":{"select":"sélectionner","selected":"({{count}}) sélectionnés","select_replies":"selectionner +réponses","delete":"supprimer la sélection","cancel":"annuler la sélection","select_all":"tout sélectionner","deselect_all":"tout désélectionner","description":{"one":"vous avez sélectionné \u003cb\u003e1\u003c/b\u003e message.","other":"Vous avez sélectionné \u003cb\u003e{{count}}\u003c/b\u003e messages."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"Citer","edit":"Éditer {{link}} par {{replyAvatar}} {{username}}","edit_reason":"Raison :","post_number":"message {{number}}","last_edited_on":"message dernièrement édité le","reply_as_new_topic":"Répondre en créant un sujet lié","continue_discussion":"Suite du sujet {{postLink}}:","follow_quote":"Voir le message cité","show_full":"Voir le message en entier","show_hidden":"Afficher le contenu caché.","deleted_by_author":{"one":"(message supprimé par son auteur, sera supprimé automatiquement dans %{count} heure à moins qu'il ne soit signalé)","other":"(message supprimé par son auteur, sera supprimé automatiquement dans %{count} heures à moins qu'il ne soit signalé)"},"expand_collapse":"étendre/réduire","gap":{"one":"voir 1 réponse cachée","other":"voir {{count}} réponses cachées"},"more_links":"{{count}} de plus...","unread":"Ce message est non lu","has_replies":{"one":"{{count}} Réponse","other":"{{count}} Réponses"},"has_likes":{"one":"{{count}} J'aime","other":"{{count}} J'aime"},"has_likes_title":{"one":"1 personne a aimé ce message","other":"{{count}} personnes ont aimé ce message"},"has_likes_title_only_you":"vous avez aimé ce message","has_likes_title_you":{"one":"vous et 1 autre personne ont aimé ce message","other":"vous et {{count}} autres personnes ont aimé ce message"},"errors":{"create":"Désolé, il y a eu une erreur lors de la publication de votre message. Merci de réessayer.","edit":"Désolé, il y a eu une erreur lors de l'édition de votre message. Merci de réessayer.","upload":"Désolé, il y a eu une erreur lors de l'envoi du fichier. Merci de réessayer.","attachment_too_large":"Désolé, le fichier que vous êtes en train d'envoyer est trop grand (taille maximum de {{max_size_kb}} Ko).","file_too_large":"Désolé, le fichier que vous êtes en train d'envoyer est trop grand (taille maximum de {{max_size_kb}} Ko)","too_many_uploads":"Désolé, vous ne pouvez envoyer qu'un seul fichier à la fois.","too_many_dragged_and_dropped_files":"Désolé, vous pouvez seulement glisser-déposer jusqu'à 10 fichiers à la fois.","upload_not_authorized":"Désolé, le fichier que vous êtes en train d'envoyer n'est pas autorisé (extensions autorisées : {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Désolé, les nouveaux utilisateurs ne peuvent pas envoyer d'image.","attachment_upload_not_allowed_for_new_user":"Désolé, les nouveaux utilisateurs ne peuvent pas envoyer de fichier.","attachment_download_requires_login":"Désolé, vous devez être connecté pour télécharger une pièce jointe."},"abandon":{"confirm":"Êtes-vous sûr de vouloir abandonner votre message ?","no_value":"Non, le conserver","yes_value":"Oui, abandonner"},"via_email":"message depuis un courriel","whisper":"ce message est un murmure privé pour les modérateurs","wiki":{"about":"ce message est en mode wiki; les utilisateurs de base peuvent le modifier"},"archetypes":{"save":"Sauvegarder les options"},"controls":{"reply":"Rédiger une réponse à ce message","like":"J'aime ce message","has_liked":"vous avez aimé ce message","undo_like":"annuler j'aime","edit":"Éditer ce message","edit_anonymous":"Désolé, mais vous devez être connecté pour éditer ce message.","flag":"signaler secrètement ce message pour attirer l'attention ou envoyer une notification privée à son sujet","delete":"Supprimer ce message","undelete":"Annuler la suppression de ce message","share":"Partager ce message","more":"Plus","delete_replies":{"confirm":{"one":"Voulez-vous aussi supprimer la réponse qui suit directement ce message ?","other":"Voulez-vous aussi supprimer les  {{count}} réponse qui suivent directement ce message ?"},"yes_value":"Oui, supprimer les réponses égalements","no_value":"Non, juste ce message"},"admin":"action sur message d'administrateur","wiki":"Basculer en mode wiki","unwiki":"Retirer le mode wiki","convert_to_moderator":"Ajouter la couleur modérateur","revert_to_regular":"Retirer la couleur modérateur","rebake":"Reconstruire l'HTML","unhide":"Ré-afficher","change_owner":"Modifier la propriété"},"actions":{"flag":"Signaler","defer_flags":{"one":"Reporter le signalement","other":"Reporter les signalements"},"it_too":{"off_topic":"Le signaler également","spam":"Le signaler également","inappropriate":"Le signaler également","custom_flag":"Le signaler également","bookmark":"L'ajouter également en signet","like":"L'aimer également","vote":"Votez pour lui également"},"undo":{"off_topic":"Annuler le signalement","spam":"Annuler le signalement","inappropriate":"Annuler le signalement","bookmark":"Retirer de vos signets","like":"Annuler j'aime","vote":"Retirer votre vote"},"people":{"off_topic":"{{icons}} l'ont signalé comme étant hors-sujet","spam":"{{icons}} l'ont signalé comme étant du spam","spam_with_url":"{{icons}} signalé \u003ca href='{{postUrl}}'\u003ececi comme spam\u003c/a\u003e","inappropriate":"{{icons}} l'ont signalé comme inapproprié","notify_moderators":"{{icons}} l'ont signalé pour modération","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003el'ont signalé pour modération\u003c/a\u003e","notify_user":"{{icons}} a envoyé un message","notify_user_with_url":"{{icons}} a envoyé un \u003ca href='{{postUrl}}'\u003emessage\u003c/a\u003e","bookmark":"{{icons}} l'ont ajouté à leurs signets","like":"{{icons}} l'ont aimé","vote":"{{icons}} ont voté pour"},"by_you":{"off_topic":"Vous l'avez signalé comme étant hors-sujet","spam":"Vous l'avez signalé comme étant du spam","inappropriate":"Vous l'avez signalé comme inapproprié","notify_moderators":"Vous l'avez signalé pour modération","notify_user":"Vous avez envoyé un message à cet utilisateur","bookmark":"Vous l'avez ajouté à vos signets","like":"Vous l'avez aimé","vote":"Vous avez voté pour"},"by_you_and_others":{"off_topic":{"one":"Vous et 1 autre personne l'avez signalé comme étant hors-sujet","other":"Vous et {{count}} autres personnes l'avez signalé comme étant hors-sujet"},"spam":{"one":"Vous et 1 autre personne l'avez signalé comme étant du spam","other":"Vous et {{count}} autres personnes l'avez signalé comme étant du spam"},"inappropriate":{"one":"Vous et 1 autre personne l'avez signalé comme inapproprié","other":"Vous et {{count}} autres personnes l'avez signalé comme inapproprié"},"notify_moderators":{"one":"Vous et 1 autre personne l'avez signalé pour modération","other":"Vous et {{count}} autres personnes l'avez signalé pour modération"},"notify_user":{"one":"1 autre personne et vous avez envoyé un message à cet utilisateur","other":"{{count}} autres personnes et vous avez envoyé un message à cet utilisateur"},"bookmark":{"one":"Vous et 1 autre personne l'avez ajouté à vos signets","other":"Vous et {{count}} autres personnes l'avez ajouté à vos signets"},"like":{"one":"Vous et 1 autre personne l'avez aimé","other":"Vous et {{count}} autres personnes l'avez aimé"},"vote":{"one":"Vous et 1 autre personne avez voté pour","other":"Vous et {{count}} autres personnes avez voté pour"}},"by_others":{"off_topic":{"one":"1 personne l'a signalé comme étant hors-sujet","other":"{{count}} personnes l'ont signalé comme étant hors-sujet"},"spam":{"one":"1 personne a signalé ceci comme étant du spam","other":"{{count}} personnes ont signalé ceci comme étant du spam"},"inappropriate":{"one":"1 personne a signalé ceci comme étant inapproprié","other":"{{count}} personnes ont signalé ceci comme étant inapproprié"},"notify_moderators":{"one":"1 personne a signalé ceci pour modération","other":"{{count}} personnes ont signalé pour modération"},"notify_user":{"one":"1 personne a envoyé un message à cet utilisateur","other":"{{count}} personnes ont envoyé un message à cet utilisateur"},"bookmark":{"one":"1 personne a ajouté ceci à ses signets","other":"{{count}} personnes ont ajouté ceci à leurs signets"},"like":{"one":"1 personne a aimé ceci","other":"{{count}} personnes ont aimé ceci"},"vote":{"one":"1 personne a voté pour ce message","other":"{{count}} personnes ont voté pour ce message"}}},"delete":{"confirm":{"one":"Êtes-vous sûr de vouloir supprimer ce message ?","other":"Êtes-vous sûr de vouloir supprimer tous ces messages ?"}},"revisions":{"controls":{"first":"Première Révision","previous":"Révision précédente","next":"Révision suivante","last":"Dernière révision","hide":"Masquer la révision","show":"Afficher la révision","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Afficher le rendu avec les ajouts et les retraits en ligne","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Afficher les diffs de rendus côte-à-côte","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Afficher les différences de la source côte-à-côte","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Brut"}}}},"category":{"can":"peut\u0026hellip; ","none":"(pas de catégorie)","all":"Toutes les catégories","choose":"Sélectionner une catégorie\u0026hellip;","edit":"éditer","edit_long":"Modifier","view":"Voir les sujets dans cette catégorie","general":"Général","settings":"Paramètres","topic_template":"Modèle de Sujet","delete":"Supprimer la catégorie","create":"Nouvelle catégorie","create_long":"Créer une nouvelle catégorie","save":"Enregistrer la catégorie","slug":"Identifiant de la catégorie","slug_placeholder":"(Facultatif) insérer tirets entre mots dans url","creation_error":"Il y a eu une erreur lors de la création de la catégorie.","save_error":"Il y a eu une erreur lors de la sauvegarde de la catégorie.","name":"Nom de la catégorie","description":"Description","topic":"catégorie du sujet","logo":"Logo de la catégorie","background_image":"Image de fond de la catégorie","badge_colors":"Couleurs du badge","background_color":"Couleur du fond","foreground_color":"Couleur du texte","name_placeholder":"Un ou deux mots maximum","color_placeholder":"N'importe quelle couleur","delete_confirm":"Êtes-vous sûr de vouloir supprimer cette catégorie ?","delete_error":"Il y a eu une erreur lors de la suppression.","list":"Liste des catégories","no_description":"Veuillez ajouter une description pour cette catégorie","change_in_category_topic":"Éditer la description","already_used":"Cette couleur est déjà utilisée par une autre catégorie","security":"Sécurité","special_warning":"Avertissement : cette catégorie est une catégorie pré-remplie et les réglages de sécurité ne peuvent pas être modifiés. Si vous ne souhaitez pas utiliser cette catégorie, supprimez-là au lieu de détourner sa fonction.","images":"Images","auto_close_label":"Fermer automatiquement après :","auto_close_units":"heures","email_in":"Adresse de courriel entrante personnalisée :","email_in_allow_strangers":"Accepter les courriels d'utilisateurs anonymes sans compte","email_in_disabled":"La possibilité de créer des nouveaux sujets via courriel est désactivé dans les Paramètres. Pour l'activer,","email_in_disabled_click":"activer le paramètre \"email in\".","contains_messages":"Modifier cette catégorie pour qu'elle ne contienne que des messages.","suppress_from_homepage":"Retirer cette catégorie de la page d'accueil","allow_badges_label":"Autoriser les badges à être accordé dans cette catégorie","edit_permissions":"Éditer les permissions","add_permission":"Ajouter une Permission","this_year":"cette année","position":"position","default_position":"Position par défaut","position_disabled":"Les catégories seront affichées dans l'ordre d'activité. Pour contrôler l'ordre des catégories dans la liste,","position_disabled_click":"activer le paramètre \"fixed category positions\"","parent":"Catégorie Parent","notifications":{"watching":{"title":"S'abonner","description":"Vous surveillerez automatiquement tous les nouveaux sujets dans ces catégories. Vous serez averti pour tout nouveau message dans chaque sujet, et le nombre de nouvelles réponses sera affiché."},"tracking":{"title":"Suivi","description":"Vous surveillerez automatiquement tous les nouveaux sujets dans ces catégories. Vous serez averti si quelqu'un mentionne votre @nom ou vous répond, et le nombre de nouvelles réponses sera affiché."},"regular":{"title":"Normal","description":"Vous serez notifié si quelqu'un mentionne votre @pseudo ou vous répond."},"muted":{"title":"Silencieux","description":"Vous ne serez jamais notifié de rien concernant les nouveaux sujets dans ces catégories, et elles n'apparaîtront pas dans les dernières catégories."}}},"flagging":{"title":"Merci de nous aider à garder notre communauté aimable !","private_reminder":"les signalements sont privés, \u003cb\u003eseulement\u003c/b\u003e visible aux modérateurs","action":"Signaler ce message","take_action":"Signaler","notify_action":"Message","delete_spammer":"Supprimer le spammeur","delete_confirm":"Vous vous apprêtez à supprimer \u003cb\u003e%{posts}\u003c/b\u003e messages et  \u003cb\u003e%{topics}\u003c/b\u003e sujets de cet utilisateur, supprimer son compte, bloquer les inscriptions depuis son adresse IP \u003cb\u003e%{ip_address}\u003c/b\u003e et à ajouter son adresse de courriel \u003cb\u003e%{email}\u003c/b\u003e à la liste des utilisateurs bloqués. Etes-vous sûr que cet utilisateur est un spammeur ?","yes_delete_spammer":"Oui, supprimer le spammeur","ip_address_missing":"(N/A)","hidden_email_address":"(masqué)","submit_tooltip":"Soumettre le signalement privé","take_action_tooltip":"Atteindre le seuil de signalement immédiatement, plutôt que d'attendre plus de signalement de la communauté.","cant":"Désolé, vous ne pouvez pas signaler ce message pour le moment","notify_staff":"Notifier les responsables","formatted_name":{"off_topic":"C'est hors-sujet","inappropriate":"C'est inapproprié","spam":"C'est du spam"},"custom_placeholder_notify_user":"Soyez précis, constructif, et toujours respectueux.","custom_placeholder_notify_moderators":"Dites-nous ce qui vous dérange spécifiquement, et fournissez des liens pertinents et exemples si possible.","custom_message":{"at_least":"saisir au moins {{n}} caractères","more":"{{n}} restants...","left":"{{n}} restants"}},"flagging_topic":{"title":"Merci de nous aider à garder notre communauté civilisé !","action":"Signaler Sujet","notify_action":"Message"},"topic_map":{"title":"Résumé du sujet","participants_title":"Auteurs fréquents","links_title":"Liens populaires","links_shown":"montrer les {{totalLinks}} liens...","clicks":{"one":"1 clic","other":"%{count} clics"}},"topic_statuses":{"warning":{"help":"Ceci est un avertissement officiel."},"bookmarked":{"help":"Vous avez ajouté ce sujet à vos signets"},"locked":{"help":"Ce sujet est fermé; il n'accepte plus de nouvelles réponses"},"archived":{"help":"Ce sujet est archivé; il est gelé et ne peut être modifié"},"locked_and_archived":{"help":"Ce sujet est fermé et archivé ; il n'accepte plus de nouvelles réponses et ne peut plus être modifié"},"unpinned":{"title":"Désépinglé","help":"Ce sujet est désépinglé pour vous; il sera affiché dans l'ordre par défaut"},"pinned_globally":{"title":"Épingler globalement","help":"Ce sujet est épinglé globalement; il apparaîtra en premier dans la liste des derniers sujets et dans sa catégorie"},"pinned":{"title":"Épingler","help":"Ce sujet est épinglé pour vous; il s'affichera en haut de sa catégorie"},"invisible":{"help":"Ce sujet n'apparait plus dans la liste des sujets et sera seulement accessible via un lien direct"}},"posts":"Messages","posts_lowercase":"messages","posts_long":"il y a {{number}} messages dans ce sujet","original_post":"Message original","views":"Vues","views_lowercase":{"one":"vue","other":"vues"},"replies":"Réponses","views_long":"ce sujet a été vu {{number}} fois","activity":"Activité","likes":"J'aime","likes_lowercase":{"one":"J'aime","other":"J'aime"},"likes_long":"il y a {{number}} j'aime dans ce sujet","users":"Utilisateurs","users_lowercase":{"one":"utilisateur","other":"utilisateurs"},"category_title":"Catégorie","history":"Historique","changed_by":"par {{author}}","raw_email":{"title":"Couriel au format brut","not_available":"Indisponible !"},"categories_list":"Liste des Catégories","filters":{"with_topics":"Sujets %{filter}","with_category":"Sujets %{filter} sur %{category}","latest":{"title":"Récents","title_with_count":{"one":"Récent ({{count}})","other":"Récents ({{count}})"},"help":"sujets avec des messages récents"},"hot":{"title":"Populaires","help":"un selection de sujets populaires"},"read":{"title":"Lus","help":"sujets que vous avez lus, dans l'ordre de dernière lecture"},"search":{"title":"Rechercher","help":"rechercher dans tous les sujets"},"categories":{"title":"Catégories","title_in":"Catégorie - {{categoryName}}","help":"tous les sujets regroupés par catégorie"},"unread":{"title":"Non lus","title_with_count":{"one":"Non lus (1)","other":"Non lus ({{count}})"},"help":"sujets que vous suivez ou suivez attentivement actuiellement avec des messages non lus","lower_title_with_count":{"one":"1 non-lu","other":"{{count}} non lu(s)"}},"new":{"lower_title_with_count":{"one":"1 nouveau","other":"{{count}} nouveaux"},"lower_title":"nouveau","title":"Nouveaux","title_with_count":{"one":"Nouveau (1)","other":"Nouveaux ({{count}})"},"help":"sujets créés dans les derniers jours"},"posted":{"title":"Mes Messages","help":"sujets auxquels vous avez participé"},"bookmarks":{"title":"Signets","help":"sujets ajoutés à vos signets"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"},"help":"derniers sujets dans la catégorie {{categoryName}}"},"top":{"title":"Top","help":"les meilleurs sujets de l'année, du mois, de la semaine ou du jour","all":{"title":"depuis toujours"},"yearly":{"title":"Annuel"},"quarterly":{"title":"Trimestriel"},"monthly":{"title":"Mensuel"},"weekly":{"title":"Hebdomadaire"},"daily":{"title":"Quotidien"},"all_time":"Depuis toujours","this_year":"Année","this_quarter":"Trimestre","this_month":"Mois","this_week":"Semaine","today":"Aujourd'hui","other_periods":"voir le top"}},"browser_update":"Malheureusement, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003evotre navigateur est trop vieux pour ce site\u003c/a\u003e. Merci \u003ca href=\"http://browsehappy.com\"\u003ede mettre à jour votre navigateur\u003c/a\u003e.","permission_types":{"full":"Créer / Répondre / Voir","create_post":"Répondre / Voir","readonly":"Voir"},"poll":{"voters":{"one":"votant","other":"votants"},"total_votes":{"one":"vote au total","other":"votes au total"},"average_rating":"Notation moyenne : \u003cstrong\u003e%{average}\u003c/strong\u003e","multiple":{"help":{"at_least_min_options":{"one":"Vous devez choisir au moins une option.","other":"Vous devez choisir au moins \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"Vous pouvez choisir une option.","other":"Vous pouvez choisir jusqu’à \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"Vous devez choisir une option.","other":"Vous devez choisir \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"between_min_and_max_options":"Vous devez choisir entre \u003cstrong\u003e%{min}\u003c/strong\u003e et \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"cast-votes":{"title":"Distribuez vos votes","label":"Votez maintenant !"},"show-results":{"title":"Afficher les résultats du sondage","label":"Afficher les résultats"},"hide-results":{"title":"Retourner au vote","label":"Masquer les résultats"},"open":{"title":"Ouvrir le sondage","label":"Ouvrir","confirm":"Êtes-vous sûr de vouloir ouvrir ce sondage ?"},"close":{"title":"Fermer le sondage","label":"Fermer","confirm":"Êtes-vous sûr de vouloir fermer ce sondage ?"},"error_while_toggling_status":"Une erreur s'est produite lors du changement de statut de ce sondage.","error_while_casting_votes":"Une erreur s'est produite lors de la distribution de vos votes."},"type_to_filter":"Commencez à taper pour filtrer...","admin":{"title":"Administrateur","moderator":"Modérateur","dashboard":{"title":"Tableau de bord","last_updated":"Tableau de bord actualisé le :","version":"Version de Discourse","up_to_date":"Vous utilisez la dernière version de Discourse.","critical_available":"Une mise à jour critique est disponible.","updates_available":"Des mises à jour sont disponibles.","please_upgrade":"Veuillez mettre à jour !","no_check_performed":"Une vérification des mises à jour n'a pas été effectuée. Vérifiez que sidekiq est en cours d'exécution.","stale_data":"Une vérification des mises à jour n'a pas été effectuée récemment. Vérifiez que sidekiq est en cours d'exécution.","version_check_pending":"On dirait que vous avez fait une mise à jour récemment. Fantastique!","installed_version":"Version installée","latest_version":"Dernière version","problems_found":"Quelques problèmes ont été trouvés dans votre installation de Discourse :","last_checked":"Dernière vérification","refresh_problems":"Rafraîchir","no_problems":"Aucun problème n'a été trouvé.","moderators":"Modérateurs :","admins":"Administateurs :","blocked":"Bloqués :","suspended":"Suspendu :","private_messages_short":"Msgs","private_messages_title":"Messages","mobile_title":"Mobile","space_free":"{{size}} libre","uploads":"téléchargements","backups":"sauvegardes","traffic_short":"Trafic","traffic":"Requêtes Web Application","page_views":"Requêtes API","page_views_short":"Requêtes API","show_traffic_report":"Voir rapport de trafic détaillé","reports":{"today":"Aujourd'hui","yesterday":"Hier","last_7_days":"les 7 derniers jours","last_30_days":"les 30 derniers jours","all_time":"depuis toujours","7_days_ago":"il y a 7 jours","30_days_ago":"il y a 30 jours","all":"Tous","view_table":"tableau","view_chart":"histogramme","refresh_report":"Actualiser le rapport","start_date":"Date de début","end_date":"Date de fin"}},"commits":{"latest_changes":"Dernières modifications: merci de mettre à jour régulièrement!","by":"par"},"flags":{"title":"Signalements","old":"Ancien","active":"Actifs","agree":"Accepter","agree_title":"Confirme que le signalement est correct et valide.","agree_flag_modal_title":"Accepter et...","agree_flag_hide_post":"Accepter (caché le message + envoi d'un MP)","agree_flag_hide_post_title":"Masquer ce message et envoyer automatiquement un message à l'utilisateur afin qu'il le modifie rapidement","agree_flag_restore_post":"Accepter (restauré le message)","agree_flag_restore_post_title":"Restaurer ce message","agree_flag":"Accepter le signalement","agree_flag_title":"Accepter le signalement et garder le message inchangé","defer_flag":"Reporter","defer_flag_title":"Retirer le signalement; il ne requière pas d'action pour le moment.","delete":"Supprimer","delete_title":"Supprimer le message signalé.","delete_post_defer_flag":"Supprimer le message et reporter le signalement","delete_post_defer_flag_title":"Supprimer le message; si c'est le premier message, le sujet sera supprimé","delete_post_agree_flag":"Supprimer le message et accepter le signalement","delete_post_agree_flag_title":"Supprimer le message; si c'est le premier message, le sujet sera supprimé","delete_flag_modal_title":"Supprimer et...","delete_spammer":"Supprimer le spammer","delete_spammer_title":"Supprimer cet utilisateur et tous ses messages et sujets de ce dernier.","disagree_flag_unhide_post":"Refuser (ré-afficher le message)","disagree_flag_unhide_post_title":"Supprimer tous les signalements de ce message et ré-affiché ce dernier","disagree_flag":"Refuser","disagree_flag_title":"Refuser le signalement car il est invalide ou incorrect","clear_topic_flags":"Terminer","clear_topic_flags_title":"Ce sujet a été étudié et les problèmes ont été résolus. Cliquez sur Terminer pour enlever les signalements.","more":"(plus de réponses...)","dispositions":{"agreed":"accepté","disagreed":"refusé","deferred":"reporté"},"flagged_by":"Signalé par","resolved_by":"Résolu par","took_action":"Prendre une mesure","system":"Système","error":"Quelque chose s'est mal passé","reply_message":"Répondre","no_results":"Il n'y a aucun signalements.","topic_flagged":"Ce \u003cstrong\u003esujet\u003c/strong\u003e a été signalé.","visit_topic":"Consulter le sujet pour intervenir","was_edited":"Le message a été édité après le premier signalement","previous_flags_count":"Ce message a déjà été signalé {{count}} fois.","summary":{"action_type_3":{"one":"hors sujet","other":"hors sujet x{{count}}"},"action_type_4":{"one":"inaproprié","other":"inaproprié x{{count}}"},"action_type_6":{"one":"personnalisé","other":"personnalisé x{{count}}"},"action_type_7":{"one":"personnalisé","other":"personnalisé x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Groupe primaire","no_primary":"(pas de groupe primaire)","title":"Groupes","edit":"Éditer les groupes","refresh":"Actualiser","new":"Nouveau","selector_placeholder":"entrer le pseudo","name_placeholder":"Nom du groupe, sans espace, mêmes règles que pour les pseudos","about":"Modifier votre adhésion et les noms ici","group_members":"Membres du groupe","delete":"Supprimer","delete_confirm":"Supprimer ce groupe ?","delete_failed":"Impossible de supprimer le groupe. Si c'est un groupe automatique il ne peut être détruit.","delete_member_confirm":"Enlever '%{username}' du groupe '%{group}'?","delete_owner_confirm":"Retirer les privilèges de propriétaire pour '%{username}' ?","name":"Nom","add":"Ajouter","add_members":"Ajouter des membres","custom":"Personnaliser","bulk_complete":"Les utilisateurs ont été ajoutés au groupe","bulk":"Ajouter au groupe en masse","bulk_paste":"Coller une liste de pseudo ou courriel, un par ligne :","bulk_select":"(sélectionner un groupe)","automatic":"Automatique","automatic_membership_email_domains":"Les utilisateurs qui s'enregistrent avec un domaine courriel qui correspond exactement à un élément de cette liste seront automatiquement ajoutés à ce groupe:","automatic_membership_retroactive":"Appliquer la même règle de domaine courriel pour les utilisateurs existants","default_title":"Titre par défaut pour tous les utilisateurs de ce groupe","primary_group":"Définir comme groupe primaire automatiquement","group_owners":"Propriétaires","add_owners":"Ajouter des propriétaires"},"api":{"generate_master":"Générer une clé Maître pour l'API","none":"Il n'y a pas de clés API actives en ce moment.","user":"Utilisateur","title":"API","key":"Clé API","generate":"Générer","regenerate":"Regénérer","revoke":"Révoquer","confirm_regen":"Êtes-vous sûr de vouloir remplacer cette clé API par une nouvelle ?","confirm_revoke":"Êtes-vous sûr de vouloir révoquer cette clé ?","info_html":"Cette clé vous permettra de créer et mettre à jour des sujets à l'aide d'appels JSON.","all_users":"Tous les Utilisateurs","note_html":"Gardez cette clé \u003cstrong\u003esecrète\u003c/strong\u003e ! Tous les personnes qui la possède peuvent créer des messages au nom de n'import quel utilisateur."},"plugins":{"title":"Plugins","installed":"Plugins installés","name":"Nom du plugin","none_installed":"Vous n'avez aucun plugin installé.","version":"Version du plugin","enabled":"Activé ?","is_enabled":"O","not_enabled":"N","change_settings":"Changer les paramètres","change_settings_short":"Paramètres","howto":"Comment installer des plugins ?"},"backups":{"title":"Sauvegardes","menu":{"backups":"Sauvegardes","logs":"Journaux"},"none":"Aucune sauvegarde disponible.","read_only":{"enable":{"title":"Activer le mode lecture seule","label":"Activer le mode lecture seule","confirm":"Êtes-vous sûr de vouloir activer le mode lecture seule?"},"disable":{"title":"Désactiver le mode lecture seule","label":"Désactiver le mode lecture seule"}},"logs":{"none":"Pas de journaux pour l'instant..."},"columns":{"filename":"Nom du fichier","size":"Taille"},"upload":{"label":"Envoyer","title":"Envoyer une sauvegarde à cette instance","uploading":"Envoi en cours...","success":"'{{filename}}' a été envoyé avec succès.","error":"Il y a eu une erreur lors de l'envoi de '{{filename}}': {{message}}"},"operations":{"is_running":"Une opération est en cours d'exécution ...","failed":"Le/La {{operation}} a échoué(e). Veuillez consulter les journaux.","cancel":{"label":"Annuler","title":"Annuler l'opération en cours","confirm":"Êtes-vous sûr de vouloir annuler l'opération en cours?"},"backup":{"label":"Sauvegarder","title":"Créer une sauvegarde","confirm":"Voulez-vous démarrer une nouvelle sauvegarde ?","without_uploads":"Oui (ne pas inclure les fichiers)"},"download":{"label":"Télécharger","title":"Télécharger la sauvegarde"},"destroy":{"title":"Supprimer la sauvegarde","confirm":"Êtes-vous sûr de vouloir détruire cette sauvegarde?"},"restore":{"is_disabled":"La restauration est désactivée dans les paramètres du site.","label":"Restaurer","title":"Restaurer la sauvegarde","confirm":"Êtes-vous sûr de vouloir restaurer cette sauvegarde?"},"rollback":{"label":"Revenir en arrière","title":"Restaurer (RollBack) la base de données à l'état de travail précédent","confirm":"Êtes-vous sûr de vouloir restaurer (rollback) la base de données à l'état de fonctionnement précédent?"}}},"export_csv":{"user_archive_confirm":"Êtes-vous sûr de vouloir télécharger vos messages?","success":"L'exportation a été initialisé. Vous serez averti par message lorsque le traitement sera terminé.","failed":"L'export a échoué. Veuillez consulter les logs.","rate_limit_error":"Les messages peuvent être téléchargés une fois par jour, veuillez ressayer demain.","button_text":"Exporter","button_title":{"user":"Exporter la liste des utilisateurs dans un fichier CSV.","staff_action":"Exporter la liste des actions des responsables dans un fichier CSV.","screened_email":"Exporter la liste des adresses de courriel sous surveillance dans un fichier CSV.","screened_ip":"Exporter la liste complète des adresses IP sous surveillance dans un fichier CSV.","screened_url":"Exporter toutes les URL sous surveillance vers un fichier CSV"}},"export_json":{"button_text":"Exporter"},"invite":{"button_text":"Envoyer invitations","button_title":"Envoyer invitations"},"customize":{"title":"Personnaliser","long_title":"Personnalisation du site","css":"CSS","header":"En-tête","top":"Top","footer":"Pied de page","embedded_css":"CSS intégré","head_tag":{"text":"\u003c/head\u003e","title":"HTML qui sera inséré avant la balise \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML qui sera inséré avant la balise \u003c/body\u003e"},"override_default":"Ne pas inclure la feuille de style par défaut","enabled":"Activé ?","preview":"prévisualiser","undo_preview":"supprimer l'aperçu","rescue_preview":"style par défaut","explain_preview":"Voir le site avec la feuille de style personnalisé","explain_undo_preview":"Revenir à la feuille de style personnalisé actuellement activée","explain_rescue_preview":"Voir le site avec la feuille de style par défaut","save":"Sauvegarder","new":"Nouveau","new_style":"Nouveau style","import":"Importer","import_title":"Sélectionnez un fichier ou collez du texte","delete":"Supprimer","delete_confirm":"Supprimer cette personnalisation","about":"Modification des feuilles de styles et en-têtes de votre site. Ajouter un style personnalisé pour commencer.","color":"Couleur","opacity":"Opacité","copy":"Copier","email_templates":{"title":"Modèle de courriel","subject":"Sujet","body":"Corps","none_selected":"Choisissez un modèle de courriel pour commencer l'édition","revert":"Annuler les changements","revert_confirm":"Êtes-vous sur de vouloir annuler vos changements ?"},"css_html":{"title":"CSS/HTML","long_title":"Personnalisation du CSS et HTML"},"colors":{"title":"Couleurs","long_title":"Palettes de couleurs","about":"Modification des couleurs utilisés par le site sans écrire du CSS. Ajouter une palette pour commencer.","new_name":"Nouvelle palette de couleurs","copy_name_prefix":"Copie de","delete_confirm":"Supprimer cette palette de couleurs ?","undo":"annuler","undo_title":"Annuler vos modifications sur cette couleur depuis la dernière fois qu'elle a été sauvegarder.","revert":"rétablir","revert_title":"Rétablir la couleur de la palette par défaut de Discourse.","primary":{"name":"primaire","description":"La plupart des textes, icônes et bordures."},"secondary":{"name":"secondaire","description":"Les couleurs principales du fond et des textes de certains boutons."},"tertiary":{"name":"tertiaire","description":"Liens, boutons, notifications et couleurs d'accentuation."},"quaternary":{"name":"quaternaire","description":"Liens de navigation."},"header_background":{"name":"fond du header","description":"Couleur de fond du header."},"header_primary":{"name":"header primaire","description":"Textes et icônes du header. "},"highlight":{"name":"accentuation","description":"La couleur de fond des éléments accentués sur la page, comme les messages et sujets."},"danger":{"name":"danger","description":"Couleur d'accentuation pour les actions comme les messages et sujets supprimés."},"success":{"name":"succès","description":"Utiliser pour indiquer qu'une action a réussi."},"love":{"name":"aimer","description":"La couleur du bouton \"J'aime\"."},"wiki":{"name":"wiki","description":"Couleur de base utilisée pour le fond des messages de type wiki."}}},"email":{"title":"Courriel","settings":"Paramètrage","all":"Tous","sending_test":"Envoi en cours du courriel de test...","error":"\u003cb\u003eERREUR\u003c/b\u003e - %{server_error}","test_error":"Il y a eu un problème avec l'envoi du courriel de test. Veuillez vérifier vos paramètres, que votre hébergeur ne bloque pas les connections aux courriels, et réessayer.","sent":"Envoyés","skipped":"Ignorés","sent_at":"Envoyer à","time":"Heure","user":"Utilisateur","email_type":"Type de courriel","to_address":"À l'adresse","test_email_address":"Adresse de courriel à tester","send_test":"Envoyer un courriel de test","sent_test":"Envoyé !","delivery_method":"Méthode d'envoi","preview_digest":"Prévisualisation du courriel","preview_digest_desc":"Prévisualiser le contenu des courriels hebdomadaires sommaires envoyés aux utilisateurs inactifs.","refresh":"Rafraîchir","format":"Format","html":"html","text":"texte","last_seen_user":"Dernière utilisateur vu :","reply_key":"Répondre","skipped_reason":"Passer Raison","logs":{"none":"Pas de journaux trouvés.","filters":{"title":"Filtrer","user_placeholder":"pseudo","address_placeholder":"nom@exemple.com","type_placeholder":"résumé, inscription...","reply_key_placeholder":"clé de réponse","skipped_reason_placeholder":"raison"}}},"logs":{"title":"Journaux","action":"Action","created_at":"Créé","last_match_at":"Dernière occurence","match_count":"Occurences","ip_address":"IP","topic_id":"Identifiant du sujet","post_id":"Identifiant du message","category_id":"ID catégorie","delete":"Supprimer","edit":"Éditer","save":"Sauvegarder","screened_actions":{"block":"bloquer","do_nothing":"ne rien faire"},"staff_actions":{"title":"Actions des modérateurs","instructions":"Cliquez sur les pseudos et les actions pour filtrer la liste. Cliquez sur les images de profil pour aller aux pages des utilisateurs.","clear_filters":"Tout Afficher","staff_user":"Membre de l'équipe des modérateurs","target_user":"Utilisateur cible","subject":"Sujet","when":"Quand","context":"Contexte","details":"Détails","previous_value":"Précédent","new_value":"Nouveau","diff":"Diff","show":"Afficher","modal_title":"Détails","no_previous":"Il n'y a pas de valeur précédente.","deleted":"Pas de nouvelle valeur. L'enregistrement a été supprimé.","actions":{"delete_user":"Supprimer l'utilisateur","change_trust_level":"modifier le niveau de confiance","change_username":"modifier pseudo","change_site_setting":"modifier les paramètres du site","change_site_customization":"modifier la personnalisation du site","delete_site_customization":"supprimer la personnalisation du site","suspend_user":"suspendre l'utilisateur","unsuspend_user":"retirer la suspension de l'utilisateur","grant_badge":"décerné le badge","revoke_badge":"retirer le badge","check_email":"vérifier l'adresse courriel","delete_topic":"supprimer le sujet","delete_post":"supprimer le message","impersonate":"incarner","anonymize_user":"rendre l'utilisateur anonyme","roll_up":"consolider des blocs d'IP","change_category_settings":"Modifier les paramètres de la catégorie","delete_category":"Supprimer la catégorie","create_category":"Créer une catégorie"}},"screened_emails":{"title":"Courriels affichés","description":"Lorsque quelqu'un essaye de créé un nouveau compte, les adresses de courriel suivantes seront vérifiées et l'inscription sera bloquée, ou une autre action sera réalisée.","email":"Courriel","actions":{"allow":"Autoriser"}},"screened_urls":{"title":"URL affichées","description":"Les URL listées ici ont été utilisées dans des messages émis par des utilisateurs ayant été identifié comme spammeur.","url":"URL","domain":"Domaine"},"screened_ips":{"title":"IP Suivies","description":"Adresses IP qui sont surveillés. Utiliser \"Autoriser\" pour ajouter les adresses IP à la liste blanche.","delete_confirm":"Êtes-vous sûr de vouloir supprimer la règle pour %{ip_address} ?","roll_up_confirm":"Êtes-vous certain de vouloir consolider les adresses IP interdites sous forme de plages de sous réseaux ?","rolled_up_some_subnets":"Consolidation réussie des adresses IP interdites vers ces plages de sous réseau: %{subnets}.","rolled_up_no_subnet":"Aucune consolidation possible.","actions":{"block":"Bloquer","do_nothing":"Autoriser","allow_admin":"Autoriser les administrateurs"},"form":{"label":"Nouveau :","ip_address":"Adresse IP","add":"Ajouter","filter":"Rechercher"},"roll_up":{"text":"Consolider","title":"Créer de nouvelles plages de sous réseaux à bannir s'il y a au moins 'min_ban_entries_for_roll_up' entrées."}},"logster":{"title":"Logs d'erreurs"}},"impersonate":{"title":"Incarner","help":"Utiliser cet outil pour incarner un compte utilisateur à des fins de tests.\nVous devrez vous déconnecter une fois terminé.","not_found":"Cet utilisateur n'a pas été trouvé.","invalid":"Désolé, vous ne pouvez pas vous faire passer pour cet utilisateur."},"users":{"title":"Utilisateurs","create":"Ajouter un administateur","last_emailed":"Derniers contacts","not_found":"Désolé ce pseudo n'existe pas dans notre système.","id_not_found":"Désolé cet identifiant d'utilisateur n'existe pas dans notre système.","active":"Actifs","show_emails":"Afficher les adresses de courriels","nav":{"new":"Nouveaux","active":"Actifs","pending":"En attente","staff":"Responsables","suspended":"Suspendus","blocked":"Bloqués","suspect":"Suspect"},"approved":"Approuvé ?","approved_selected":{"one":"Approuver l'utilisateur","other":"Approuver les {{count}} utilisateurs"},"reject_selected":{"one":"utilisateur rejeté","other":"utilisateurs rejetés ({{count}})"},"titles":{"active":"Utilisateurs actifs","new":"Nouveaux utilisateurs","pending":"Utilisateur en attente","newuser":"Utilisateurs au niveau de confiance 0 (Nouveaux utilisateurs)","basic":"Utilisateurs au niveau de confiance 1 (Utilisateurs de base)","member":"Utilisateurs au Niveau de confiance 2 (Membre)","regular":"Utilisateurs au Niveau de confiance 3 (Habitué)","leader":"Utilisateurs au Niveau de confiance 4 (meneur)","staff":"Membres de l'équipe des responables","admins":"Administrateurs","moderators":"Modérateurs","blocked":"Utilisateurs bloqués","suspended":"Utilisateurs suspendus","suspect":"Utilisateurs suspects"},"reject_successful":{"one":"Utilisateur rejeté avec succès.","other":"%{count} utilisateurs rejetés avec succès."},"reject_failures":{"one":"Utilisateur dont le rejet a échoué.","other":"%{count} utilisateurs dont le rejet a échoué."},"not_verified":"Non verifié","check_email":{"title":"Afficher l'adresse courriel de cet utilisateur","text":"Afficher"}},"user":{"suspend_failed":"Il y a eu un problème pendant la suspension de cet utilisateur {{error}}","unsuspend_failed":"Il y a eu un problème pendant le retrait de la suspension de cet utilisateur {{error}}","suspend_duration":"Combien de temps l'utilisateur sera suspendu ?","suspend_duration_units":"(jours)","suspend_reason_label":"Pourquoi suspendez-vous ? Ce texte \u003cb\u003esera visible par tout le monde\u003c/ b\u003e sur la page du profil de cet utilisateur, et sera affiché à l'utilisateur quand ils essaient de se connecter. Soyez bref.","suspend_reason":"Raison","suspended_by":"Suspendu par","delete_all_posts":"Supprimer tous les messages","delete_all_posts_confirm":"Vous allez supprimer %{posts} messages et %{topics} sujets. Êtes-vous sûr ?","suspend":"Suspendre","unsuspend":"Retirer la suspension","suspended":"Suspendu ?","moderator":"Modérateur ?","admin":"Admin ?","blocked":"Bloqué ?","show_admin_profile":"Admin","edit_title":"Modifier le titre","save_title":"Sauvegarder le titre","refresh_browsers":"Forcer le rafraîchissement du navigateur","refresh_browsers_message":"Message envoyé à tous les clients !","show_public_profile":"Afficher le profil public","impersonate":"Incarner","ip_lookup":"IP de consultation","log_out":"Déconnecter l'utilisateur","logged_out":"L'utilisateur s'est déconnecté de tous les appareils","revoke_admin":"Révoquer les droits d'admin","grant_admin":"Accorder les droits d'admin","revoke_moderation":"Révoquer les droits de modération","grant_moderation":"Accorder les droits de modération","unblock":"Débloquer","block":"Bloquer","reputation":"Réputation","permissions":"Permissions","activity":"Activité","like_count":"J'aimes donnés / reçus","last_100_days":"dans les 100 derniers jours","private_topics_count":"Messages privés","posts_read_count":"Messages lus","post_count":"Messages crées","topics_entered":"Sujets consultés","flags_given_count":"Signalements effectués","flags_received_count":"Signalements reçus","warnings_received_count":"Avertissements reçus","flags_given_received_count":"Signalements émis / reçus","approve":"Approuvé","approved_by":"approuvé par","approve_success":"Utilisateur approuvé et un courriel avec les instructions d'activation a été envoyé.","approve_bulk_success":"Bravo! Tous les utlisateurs sélectionnés ont été approuvés et notifiés.","time_read":"Temps de lecture","anonymize":"Rendre l'utilisateur anonyme","anonymize_confirm":"Êtes-vous sûr de vouloir rendre ce compte anonyme ? Ceci entraînera la modification du pseudo et de l'adresse courriel, et réinitialisera les informations du profil.","anonymize_yes":"Oui, rendre ce compte anonyme","anonymize_failed":"Il y a eu un problème lors de l'anonymisation de ce compte.","delete":"Supprimer l'utilisateur","delete_forbidden_because_staff":"Administrateurs et modérateurs ne peuvent pas être supprimés.","delete_posts_forbidden_because_staff":"Vous ne pouvez pas supprimer tous les messages des administrateurs ou des modérateurs.","delete_forbidden":{"one":"Les utilisateurs ne peuvent pas être supprimés s'ils ont posté des messages Supprimer tous les messages avant d'essayer de supprimer un utilisateur. (Les messages plus vieux que %{count} jour ne peut pas être supprimé.)","other":"Les utilisateurs ne peuvent pas être supprimés s'ils ont crée des messages. Supprimer tous les messages avant d'essayer de supprimer un utilisateur. (Les messages plus vieux que %{count} jours ne peuvent pas être supprimés.)"},"cant_delete_all_posts":{"one":"Impossible de supprimer tout les messages. Certains messages sont âgés de plus de  %{count} jour. (voir l'option delete_user_max_post_age)","other":"Impossible de supprimer tout les messages. Certains messages sont âgés de plus de  %{count} jours. (voir l'option delete_user_max_post_age)"},"cant_delete_all_too_many_posts":{"one":"Impossible de supprimer tout les messages parce-que l'utilisateur a plus d'un message. (delete_all_posts_max)","other":"Impossible de supprimer tout les messages parce-que l'utilisateur a plus de %{count} messages. (delete_all_posts_max)"},"delete_confirm":"Êtes-vous SÛR de vouloir supprimer cet utilisateur ? Cette action est irréversible !","delete_and_block":"Supprimer et \u003cb\u003ebloquer\u003c/b\u003e cette adresse de courriel et adresse IP.","delete_dont_block":"Supprimer uniquement","deleted":"L'utilisateur a été supprimé.","delete_failed":"Il y a eu une erreur lors de la suppression de l'utilisateur. Veuillez vous assurez que tous ses messages ont bien été supprimmés avant d'essayer de supprimer l'utilisateur.","send_activation_email":"Envoyer le courriel d'activation","activation_email_sent":"Un courriel d'activation a été envoyé.","send_activation_email_failed":"Il y a eu un problème lors du renvoi du courriel d'activation. %{error}","activate":"Activer le compte","activate_failed":"Il y a eu un problème lors de l'activation du compte.","deactivate_account":"Désactive le compte","deactivate_failed":"Il y a eu un problème lors de la désactivation du compte.","unblock_failed":"Problème rencontré lors du déblocage de l'utilisateur.","block_failed":"Problème rencontré lors du blocage de l'utilisateur.","deactivate_explanation":"Un utilisateur désactivé doit revalider son adresse de courriel.","suspended_explanation":"Un utilisateur suspendu ne peut pas se connecter.","block_explanation":"Un utilisateur bloqué ne peut pas écrire de message, ni créer de sujet.","trust_level_change_failed":"Il y a eu un problème lors de la modification du niveau de confiance de l'utilisateur.","suspend_modal_title":"Suspendre l'utilisateur","trust_level_2_users":"Utilisateurs de niveau de confiance 2","trust_level_3_requirements":"Niveaux de confiance 3 Pré-requis","trust_level_locked_tip":"Le niveau de confiance est verrouillé. Le système ne changera plus le niveau de confiance de cet utilisateur.","trust_level_unlocked_tip":"les niveaux de confiance sont déverrouillés. Le système pourra promouvoir ou rétrograder des utilisateurs.","lock_trust_level":"Verrouiller le niveau de confiance","unlock_trust_level":"Déverrouiller le niveau de confiance","tl3_requirements":{"title":"Pré-requis pour le niveau de confiance 3","table_title":"Les 100 derniers jours :","value_heading":"Valeur","requirement_heading":"Pré-requis","visits":"Visites","days":"jours","topics_replied_to":"Sujets auquels l'utilisateur a répondu","topics_viewed":"Sujets vus","topics_viewed_all_time":"Sujets vus (depuis le début)","posts_read":"Messages lus","posts_read_all_time":"Messages lus (depuis le début)","flagged_posts":"Messages signalés","flagged_by_users":"Utilisateurs signalés","likes_given":"J'aimes donnés","likes_received":"J'aimes reçus","likes_received_days":"J'aime reçus : par jour","likes_received_users":"J'aime reçus : par utilisateur","qualifies":"Admissible au niveau de confiance 3.","does_not_qualify":"Non admissible au niveau de confiance 3.","will_be_promoted":"Sera promu prochainement.","will_be_demoted":"Sera rétrograder prochainement.","on_grace_period":"Actuellement en période de grâce, sera bientôt rétrograder.","locked_will_not_be_promoted":"Niveau de confiance verrouillé. Ne sera jamais promu.","locked_will_not_be_demoted":"Niveau de confiance verrouillé. Ne sera jamais rétrograder."},"sso":{"title":"Authentification unique (SSO)","external_id":"ID Externe","external_username":"Pseudo","external_name":"Nom","external_email":"Courriel","external_avatar_url":"URL de l'image de profil"}},"user_fields":{"title":"Champs utilisateurs","help":"Ajouter des champs que vos utilisateurs pourront remplir.","create":"Créer un champ utilisateur","untitled":"Sans titre","name":"Nom du champ","type":"Type du champ","description":"Description du champs","save":"Sauvegarder","edit":"Modifier","delete":"Supprimer","cancel":"Annuler","delete_confirm":"Etes vous sur de vouloir supprimer ce champ utilisateur ?","options":"Options","required":{"title":"Obligatoire à l'inscription ?","enabled":"obligatoire","disabled":"optionnel"},"editable":{"title":"Modifiable après l'inscription ?","enabled":"modifiable","disabled":"non modifiable"},"show_on_profile":{"title":"Afficher dans le profil public","enabled":"affiché dans le profil","disabled":"pas affiché dans le profil"},"field_types":{"text":"Zone de texte","confirm":"Confirmation","dropdown":"Menu déroulant"}},"site_text":{"none":"Choisissez un type de contenu pour commencer l'édition.","title":"Contenu"},"site_settings":{"show_overriden":"Ne montrer que ce qui a été changé","title":"Paramètres","reset":"rétablir","none":"rien","no_results":"Aucun résultat trouvé.","clear_filter":"Effacer","add_url":"ajouter URL","add_host":"ajouter hôte","categories":{"all_results":"Toutes","required":"Requis","basic":"Globaux","users":"Utilisateurs","posting":"Messages","email":"Courriel","files":"Fichiers","trust":"Niveaux de confiance","security":"Sécurité","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Limites des taux","developer":"Développeur","embedding":"Externe","legal":"Légal","uncategorized":"Autre","backups":"Sauvegardes","login":"Connexion","plugins":"Plugins","user_preferences":"Préférences"}},"badges":{"title":"Badges","new_badge":"Nouveau Badge","new":"Nouveau","name":"Nom","badge":"Badge","display_name":"Nom affiché","description":"Description","badge_type":"Type de badge","badge_grouping":"Groupe","badge_groupings":{"modal_title":"Regroupement de badge"},"granted_by":"Décerné par","granted_at":"Décerné le","reason_help":"(Lien vers un message ou sujet)","save":"Sauvegarder","delete":"Supprimer","delete_confirm":"Ëtes-vous sûr de vouloir supprimer ce badge ?","revoke":"Retirer","reason":"Raison","expand":"Développer \u0026hellip;","revoke_confirm":"Êtes-vous sur de vouloir retirer ce badge à cet utilisateur ?","edit_badges":"Modifier les badges","grant_badge":"Décerner le badge","granted_badges":"Badges décernés","grant":"Décerner","no_user_badges":"%{name} ne s'est vu décerné aucun badge.","no_badges":"Il n'y a aucun badges qui peuvent être décernés.","none_selected":"Sélectionnez un badge pour commencer","allow_title":"Autoriser l'utilisation du badge comme titre","multiple_grant":"Peut être décerné plusieurs fois","listable":"Afficher le badge sur la page publique des badges","enabled":"Activer le badge","icon":"Icône","image":"Image","icon_help":"Utilisez une classe CSS Font Awesome ou une URL d'image","query":"Requête du badge (SQL)","target_posts":"Requête sur les messages","auto_revoke":"Exécuter la requête de révocation quotidiennement","show_posts":"Afficher le message concerné par le badge sur la page des badges.","trigger":"Déclencheur","trigger_type":{"none":"Mettre à jour quotidiennement","post_action":"Lorsqu'un utilisateur agit sur un message","post_revision":"Lorsqu'un utilisateur modifie ou crée un message","trust_level_change":"Lorsqu'un utilisateur change de niveau de confiance","user_change":"Lorsqu'un utilisateur est modifié ou crée"},"preview":{"link_text":"Aperçu du badge accordé","plan_text":"Aperçu avant le plan de requête","modal_title":"Aperçu de la requête du badge","sql_error_header":"Il y a une erreur avec la requête.","error_help":"Consulter les liens suivants pour obtenir de l'aide sur les requêtes de badge.","bad_count_warning":{"header":"ATTENTION !","text":"Certains badges n'ont pas été décernés. Ceci se produit  lorsque la requête du badge retourne des identifiants d'utilisateurs ou de messages qui n’existent plus. Cela peut produire des résultats non attendus - veuillez vérifier votre requête."},"no_grant_count":"Aucun badge à assigner.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge à assigner.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges à assigner."},"sample":"Exemple :","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pour son message dans %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pour son message dans %{link} à \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e à \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Ajouter un nouvel emoji qui sera disponible pour tout le monde. (Conseil: glisser-déposer plusieurs fichiers en même temps)","add":"Ajouter un nouvel emoji","name":"Nom","image":"Image","delete_confirm":"Etes vous sûr de vouloir supprimer l'emoji :%{name}: ?"},"embedding":{"get_started":"Si vous aimeriez intégrer Discourse dans un autre site, commencez par ajouter l'hôte.","confirm_delete":"Êtes-vous sûr de vouloir supprimer cet hôte?","sample":"Introduire le code HTML suivant dans votre site pour créer et intégrer des sujets Discourse. Remplacer \u003cb\u003eREPLACE_ME\u003c/b\u003e avec l'URL de la page dans laquelle vous l'intégrer.","title":"Intégration externe","host":"Hôtes permis","edit":"éditer","category":"Ajouter dans catégorie","add_host":"Ajouter hôte","settings":"Paramètres d'intégration externe","feed_settings":"Paramètres de flux RSS/ATOM","feed_description":"Fournir un flux RSS/ATOM pour votre site peut améliorer la capacité de Discourse à importer votre contenu.","crawling_settings":"Paramètres de robot","crawling_description":"Quand Discourse crée des sujets pour vos message, s'il n'y a pas de flux RSS/ATOM présent, il essayera de parser le contenu à partir du HTML. Parfois il peut être difficile d'extraire votre contenu, alors nous vous donnons ici la possibilité de spécifier des règles CSS pour faciliter l'extraction.","embed_by_username":"Pseudo pour création de sujet","embed_post_limit":"Le nombre maximum de messages à intégrer","embed_username_key_from_feed":"Clé pour extraire le pseudo du flux.","embed_truncate":"Tronquer les messages intégrés","embed_whitelist_selector":"Sélecteur CSS pour les éléments qui seront autorisés dans les contenus intégrés","embed_blacklist_selector":"Sélecteur CSS pour les éléments qui seront interdits dans les contenus intégrés","feed_polling_enabled":"Importer les messages via flux RSS/ATOM","feed_polling_url":"URL du flux RSS/ATOM à importer","save":"Sauvegarder paramètres d'intégration"},"permalink":{"title":"Permaliens","url":"URL","topic_id":"ID sujet","topic_title":"Sujet","post_id":"ID message","post_title":"Message","category_id":"ID catégorie","category_title":"Catégorie","external_url":"URL externe","delete_confirm":"Êtes-vous sur de vouloir supprimer ce permalien ?","form":{"label":"Nouveau :","add":"Ajouter","filter":"Rechercher (URL ou URL externe)"}}},"lightbox":{"download":"télécharger"},"search_help":{"title":"Aide à la recherche"},"keyboard_shortcuts_help":{"title":"Raccourcis clavier","jump_to":{"title":"Aller à","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Accueil","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Récents","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nouveau","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Non lus","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Catégories","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Haut","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Favoris","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"navigation":{"title":"Navigation","jump":"\u003cb\u003e#\u003c/b\u003e Aller au message #","back":"\u003cb\u003eu\u003c/b\u003e Retour","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Déplacer la sélection \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e ou \u003cb\u003eEntrée\u003c/b\u003e Ouvrir le sujet sélectionné","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Section Suivante/précédente"},"application":{"title":"Application","create":"\u003cb\u003ec\u003c/b\u003e Créer un nouveau sujet","notifications":"\u003cb\u003en\u003c/b\u003e Ouvrir les notifications","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Ouvrir le menu hamburger","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Ouvrir le menu de votre profil","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Afficher les sujets mis à jour","search":"\u003cb\u003e/\u003c/b\u003e Rechercher","help":"\u003cb\u003e?\u003c/b\u003e Ouvrir l'aide au clavier","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Marquer comme lu les nouveaux messages","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Marquer comme lu les sujets","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Se déconnecter"},"actions":{"title":"Actions","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Modifier signet pour ce sujet","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Épingler/De-épingler le sujet","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Partager un sujet","share_post":"\u003cb\u003es\u003c/b\u003e Partager un message","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Répondre en créant un sujet lié","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Répondre au sujet","reply_post":"\u003cb\u003er\u003c/b\u003e Répondre à un message","quote_post":"\u003cb\u003eq\u003c/b\u003e Citer un message","like":"\u003cb\u003el\u003c/b\u003e Aimer un message","flag":"\u003cb\u003e!\u003c/b\u003e Signaler un message","bookmark":"\u003cb\u003eb\u003c/b\u003e Ajouter ce message à vos signets","edit":"\u003cb\u003ee\u003c/b\u003e Editer un message","delete":"\u003cb\u003ed\u003c/b\u003e Supprimer un message","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Marquer le suivi du sujet comme silencieux","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Marquer le suivi du sujet comme normale","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Marquer le sujet comme suivi","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Marquer le sujet comme surveillé"}},"badges":{"title":"Badges","allow_title":"peut être utilisé comme votre titre","multiple_grant":"peut être décerné plusieurs fois","badge_count":{"one":"1 badge","other":"%{count} badges"},"more_badges":{"one":"+1 autre","other":"+%{count} autres"},"granted":{"one":"1 décerné","other":"%{count} décernés"},"select_badge_for_title":"Sélectionner un badge pour l'utiliser comme votre titre","none":"\u003cvide\u003e","badge_grouping":{"getting_started":{"name":"Pour commencer"},"community":{"name":"Communauté"},"trust_level":{"name":"Niveau de confiance"},"other":{"name":"Autre"},"posting":{"name":"Message"}},"badge":{"editor":{"name":"Editeur","description":"A modifié un message pour la première fois"},"basic_user":{"name":"Actif","description":"Toutes les fonctions communautaires essentielles sont accessibles"},"member":{"name":"Membre","description":"Accorde les \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003einvitations\u003c/a\u003e."},"regular":{"name":"Habitué","description":"La re-catégorisation, le renommage, le suivi de lien et le salon sont accessibles"},"leader":{"name":"Meneur","description":"L'édition, l'épinglage, la fermeture, l'archivage, la séparation et la fusion sont accessibles"},"welcome":{"name":"Bienvenue","description":"A reçu un j'aime."},"autobiographer":{"name":"Autobiographe","description":"A rempli les informations de son \u003ca href=\"/my/preferences\"\u003eprofil\u003c/a\u003e"},"anniversary":{"name":"Jubilaire","description":"Membres actif depuis un an, avec au moins un message"},"nice_post":{"name":"Joli message","description":"A reçu 10 j'aime sur un message. Ce badge peut être décerné plusieurs fois"},"good_post":{"name":"Excellent message","description":"A reçu 25 j'aime sur un message. Ce badge peut être décerné plusieurs fois"},"great_post":{"name":"Bon message","description":"A reçu 50 j'aime sur un message. Ce badge peut être décerné plusieurs fois"},"nice_topic":{"name":"Sujet intéressant","description":"A reçu 10 J'aime sur un sujet. Ce badge peut être décerné plusieurs fois"},"good_topic":{"name":"Bon sujet","description":"A reçu 25 J'aime sur un sujet. Ce badge peut être décerné plusieurs fois"},"great_topic":{"name":"Super sujet","description":"A reçu 50 J'aime sur un sujet. Ce badge peut être décerné plusieurs fois"},"nice_share":{"name":"Partage sympa","description":"Message partagé avec 25 visiteurs uniques"},"good_share":{"name":"Bon partage","description":"Message partagé avec 300 visiteurs uniques"},"great_share":{"name":"Super Partage","description":"Message partagé avec 1000 visiteurs uniques"},"first_like":{"name":"Premier j'aime","description":"A aimé un message"},"first_flag":{"name":"Premier signalement","description":"A signalé un message"},"promoter":{"name":"Ambassadeur","description":"A invité un utilisateur"},"campaigner":{"name":"Militant","description":"A invité 3 utilisateurs basiques (Niveau de confiance 1)"},"champion":{"name":"Champion","description":"A invité 5 membres (Niveau de confiance 2)"},"first_share":{"name":"Premier partage","description":"A partagé un message"},"first_link":{"name":"Premier lien","description":"A ajouté un lien interne vers un autre sujet"},"first_quote":{"name":"Première citation","description":"A cité un utilisateur"},"read_guidelines":{"name":"Règlement lu","description":"A lu le \u003ca href=\"/guidelines\"\u003erèglement de la communauté\u003c/a\u003e"},"reader":{"name":"Lecteur","description":"A lu tous les messages d'un sujet contenant plus de 100 messages"},"popular_link":{"name":"Lien populaire","description":"A posté un lien externe avec au moins 50 clics"},"hot_link":{"name":"Lien tendance","description":"A posté un lien externe avec au moins 300 clics"},"famous_link":{"name":"Lien célèbre","description":"A posté un lien externe avec au moins 1000 clics"}}},"google_search":"\u003ch3\u003eRechercher avec Google\u003c/h3\u003e\n\u003cp\u003e\n\u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n\u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n\u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n\u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n\u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","controls":"Topic Controls"},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'fr';
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
// locale : french (fr)
// author : John Fischer : https://github.com/jfroffice

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    return moment.defineLocale('fr', {
        months : "janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre".split("_"),
        monthsShort : "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_"),
        weekdays : "dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi".split("_"),
        weekdaysShort : "dim._lun._mar._mer._jeu._ven._sam.".split("_"),
        weekdaysMin : "Di_Lu_Ma_Me_Je_Ve_Sa".split("_"),
        longDateFormat : {
            LT : "HH:mm",
            L : "DD/MM/YYYY",
            LL : "D MMMM YYYY",
            LLL : "D MMMM YYYY LT",
            LLLL : "dddd D MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[Aujourd'hui à] LT",
            nextDay: '[Demain à] LT',
            nextWeek: 'dddd [à] LT',
            lastDay: '[Hier à] LT',
            lastWeek: 'dddd [dernier à] LT',
            sameElse: 'L'
        },
        relativeTime : {
            future : "dans %s",
            past : "il y a %s",
            s : "quelques secondes",
            m : "une minute",
            mm : "%d minutes",
            h : "une heure",
            hh : "%d heures",
            d : "un jour",
            dd : "%d jours",
            M : "un mois",
            MM : "%d mois",
            y : "un an",
            yy : "%d ans"
        },
        ordinal : function (number) {
            return number + (number === 1 ? 'er' : '');
        },
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('D MMMM YYYY H:mm'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
