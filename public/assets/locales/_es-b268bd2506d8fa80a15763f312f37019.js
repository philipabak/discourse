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
MessageFormat.locale.es = function ( n ) {
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
r += "Hay ";
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
r += "<a href='/unread'>1 no leído</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "<a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " no leídos</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["es"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "y ";
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
r += " <a href='/new'>1 nuevo</a> tema";
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
r += "y ";
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
})() + " nuevos</a> temas";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["es"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " restantes, o ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "explora otros temas en ";
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
r += "Este tema tiene ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 respuesta";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " respuestas";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["es"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "con una ratio de me gusta por post elevada";
return r;
},
"med" : function(d){
var r = "";
r += "con una ratio de me gusta por post bastante elevada";
return r;
},
"high" : function(d){
var r = "";
r += "con una ratio de me gusta por post elevadísima";
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
}});I18n.translations = {"es":{"js":{"number":{"format":{"separator":",","delimiter":"."},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Bytes"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"D MMM, 'YY LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM, 'YY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}h"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1a","other":"%{count}a"},"over_x_years":{"one":"\u003e 1a","other":"\u003e %{count}a"},"almost_x_years":{"one":"1a","other":"%{count}a"},"date_month":"D MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuto","other":"%{count} mins"},"x_hours":{"one":"1 hora","other":"%{count} horas"},"x_days":{"one":"1 día","other":"%{count} días"},"date_year":"D MMM, 'YY"},"medium_with_ago":{"x_minutes":{"one":"hace 1 minuto","other":"hace %{count} minutos"},"x_hours":{"one":"hace 1 hora","other":"hace %{count} horas"},"x_days":{"one":"hace 1 día","other":"hace %{count} días"}},"later":{"x_days":{"one":"1 día después","other":"%{count} días después"},"x_months":{"one":"%{count} mes después","other":"%{count} meses después"},"x_years":{"one":"%{count} año después","other":"%{count} años después"}}},"share":{"topic":"comparte un enlace a este tema","post":"post #%{postNumber}","close":"cerrar","twitter":"comparte este enlace en Twitter","facebook":"comparte este enlace en Facebook","google+":"comparte este enlace en Google+","email":"comparte este enlace por email"},"action_codes":{"split_topic":"separó este tema %{when}","autoclosed":{"enabled":"cerrado %{when}","disabled":"abierto %{when}"},"closed":{"enabled":"cerrado %{when}","disabled":"abierto %{when}"},"archived":{"enabled":"archivado %{when}","disabled":"desarchivado %{when}"},"pinned":{"enabled":"destacado %{when}","disabled":"sin destacar %{when}"},"pinned_globally":{"enabled":"destacado globalmente %{when}","disabled":"sin destacar %{when}"},"visible":{"enabled":"listado %{when}","disabled":"quitado de la lista, invisible %{when}"}},"topic_admin_menu":"acciones de administrador para el tema","emails_are_disabled":"Todos los emails salientes han sido desactivados por un administrador. No se enviará ninguna notificación por email.","edit":"editar el título y la categoría de este tema","not_implemented":"Esta característica no ha sido implementada aún, ¡lo sentimos!","no_value":"No","yes_value":"Sí","generic_error":"Lo sentimos, ha ocurrido un error.","generic_error_with_reason":"Ha ocurrido un error: %{error}","sign_up":"Registrarse","log_in":"Iniciar sesión","age":"Edad","joined":"Registrado","admin_title":"Admin","flags_title":"Reportes","show_more":"ver más","show_help":"opciones","links":"Enlaces","links_lowercase":{"one":"enlace","other":"enlaces"},"faq":"FAQ","guidelines":"Directrices","privacy_policy":"Política de Privacidad","privacy":"Privacidad","terms_of_service":"Condiciones de uso","mobile_view":"Versión móvil","desktop_view":"Versión de escritorio","you":"Tú","or":"o","now":"ahora mismo","read_more":"leer más","more":"Más","less":"Menos","never":"nunca","daily":"cada día","weekly":"cada semana","every_two_weeks":"cada dos semanas","every_three_days":"cada tres días","max_of_count":"máximo de {{count}}","alternation":"o","character_count":{"one":"{{count}} carácter","other":"{{count}} caracteres"},"suggested_topics":{"title":"Temas Sugeridos"},"about":{"simple_title":"Acerca de","title":"Sobre %{title}","stats":"Estadísticas del sitio","our_admins":"Nuestros Administradores","our_moderators":"Nuestros Moderadores","stat":{"all_time":"Todo el tiempo","last_7_days":"Últimos 7 días","last_30_days":"Últimos 30 días"},"like_count":"Me Gusta","topic_count":"Temas","post_count":"Posts","user_count":"Nuevos usuarios","active_user_count":"Usuarios activos","contact":"Contáctanos","contact_info":"En caso de un error crítico o un asunto urgente referente a este sitio, por favor, contáctanos en %{contact_info}."},"bookmarked":{"title":"Marcador","clear_bookmarks":"Quitar Marcadores","help":{"bookmark":"Clic para guardar en marcadores el primer post de este tema","unbookmark":"Clic para quitar todos los marcadores de este tema"}},"bookmarks":{"not_logged_in":"Lo sentimos, debes iniciar sesión para guardar posts en marcadores.","created":"has guardado este post en marcadores","not_bookmarked":"has leído este post, haz clic para guardarlo en marcadores","last_read":"este es el último post que has leído; haz clic para guardarlo en marcadores","remove":"Eliminar marcador","confirm_clear":"¿Seguro que deseas borrar todos los marcadores de este tema?"},"topic_count_latest":{"one":"Un tema nuevo o actualizado.","other":"{{count}} temas nuevos o actualizados."},"topic_count_unread":{"one":"Un tema sin leer.","other":"{{count}} temas sin leer."},"topic_count_new":{"one":"Un nuevo tema.","other":"{{count}} nuevos temas."},"click_to_show":"Clic para mostrar.","preview":"vista previa","cancel":"cancelar","save":"Guardar cambios","saving":"Guardando...","saved":"¡Guardado!","upload":"Subir","uploading":"Subiendo...","uploading_filename":"Subiendo {{filename}}...","uploaded":"¡Subido!","enable":"Activar","disable":"Desactivar","undo":"Deshacer","revert":"Revertir","failed":"Falló","switch_to_anon":"Modo Anónimo","switch_from_anon":"Salir del Modo Anónimo","banner":{"close":"Descartar este banner.","edit":"Editar este banner \u003e\u003e"},"choose_topic":{"none_found":"Ningún tema encontrado.","title":{"search":"Buscar un Tema por nombre, url o id:","placeholder":"escribe el título de tema aquí"}},"queue":{"topic":"Tema:","approve":"Aprobar","reject":"Rechazar","delete_user":"Eliminar usuario","title":"Necesita Aprobación","none":"No hay posts para revisar","edit":"Editar","cancel":"Cancelar","view_pending":"ver posts pendientes","has_pending_posts":{"one":"Este tema tiene \u003cb\u003e1\u003c/b\u003e post esperando aprobación","other":"Este tema tiene \u003cb\u003e{{count}}\u003c/b\u003e posts esperando aprobación"},"confirm":"Guardar Cambios","delete_prompt":"¿Seguro que quieres eliminar a \u003cb\u003e%{username}\u003c/b\u003e? Esto eliminará todos sus posts y bloqueará su email y dirección IP.","approval":{"title":"El Post Necesita Aprobación","description":"Hemos recibido tu nuevo post pero necesita ser aprobado por un moderador antes de aparecer. Por favor, ten paciencia.","pending_posts":{"one":"Tienes \u003cstrong\u003e1\u003c/strong\u003e post pendiente.","other":"Tienes \u003cstrong\u003e{{count}}\u003c/strong\u003e posts pendientes."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e publicó \u003ca href='{{topicUrl}}'\u003eel tema\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eTú\u003c/a\u003e publicaste \u003ca href='{{topicUrl}}'\u003eel tema\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e contestó a \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eTú\u003c/a\u003e contestaste a \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e contestó a \u003ca href='{{topicUrl}}'\u003eel tema\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eTú\u003c/a\u003e contestaste a \u003ca href='{{topicUrl}}'\u003eel tema\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mencionó a \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{user2Url}}'\u003ete\u003c/a\u003e mencionó","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eTú\u003c/a\u003e mencionaste a \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Publicado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Publicado por \u003ca href='{{userUrl}}'\u003eti\u003c/a\u003e","sent_by_user":"Enviado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Enviado por \u003ca href='{{userUrl}}'\u003eti\u003c/a\u003e"},"directory":{"filter_name":"filtrar por usuario","title":"Usuarios","likes_given":"Dados","likes_received":"Recibidos","topics_entered":"Vistos","topics_entered_long":"Temas vistos","time_read":"Tiempo de Lectura","topic_count":"Temas","topic_count_long":"Temas creados","post_count":"Respuestas","post_count_long":"Posts escritos","no_results":"No se encontraron resultados.","days_visited":"Visitas","days_visited_long":"Días visitados","posts_read":"Leídos","posts_read_long":"Posts leídos","total_rows":{"one":"1 usuario","other":"%{count} usuarios"}},"groups":{"add":"Añadir","selector_placeholder":"Añadir miembros","owner":"propietario","visible":"El grupo es visible para todos los usuarios","title":{"one":"grupo","other":"grupos"},"members":"Miembros","posts":"Posts","alias_levels":{"title":"¿Quién puede usar este grupo como un alias?","nobody":"Nadie","only_admins":"Solo administradores","mods_and_admins":"Solo moderadores y administradores","members_mods_and_admins":"Solo miembros del grupo, moderadores y administradores","everyone":"Todos"},"trust_levels":{"title":"Nivel de confianza entregado automáticamente a miembros cuando son añadidos:","none":"Ninguno"}},"user_action_groups":{"1":"'Me gusta' Dados","2":"'Me gusta' Recibidos","3":"Marcadores","4":"Temas","5":"Posts","6":"Respuestas","7":"Menciones","9":"Citas","10":"Favoritos","11":"Ediciones","12":"Elementos Enviados","13":"Bandeja de entrada","14":"Pendiente"},"categories":{"all":"Todas las categorías","all_subcategories":"todas","no_subcategory":"ninguna","category":"Categoría","reorder":{"title":"Reorganizar Categorías","title_long":"Reorganizar la lista de categorías","fix_order":"Ordenar posiciones","fix_order_tooltip":"No todas las categorías tienen un número de posición único, lo que puede causar resultados inesperados.","save":"Guardar orden","apply_all":"Aplicar","position":"Posición"},"posts":"Posts","topics":"Temas","latest":"Recientes","latest_by":"recientes por","toggle_ordering":"activar orden","subcategories":"Subcategorías","topic_stats":"El número de temas nuevos.","topic_stat_sentence":{"one":"%{count} tema nuevo en los últimos %{unit}.","other":"%{count} temas nuevos en los últimos %{unit}."},"post_stats":"El número de posts nuevos.","post_stat_sentence":{"one":"%{count} nuevo comentario en los pasados %{unit}","other":"%{count} nuevos comentarios en los pasados %{unit}"}},"ip_lookup":{"title":"Búsqueda de Direcciones IP","hostname":"Nombre del host","location":"Ubicación","location_not_found":"(desconocido)","organisation":"Organización","phone":"Teléfono","other_accounts":"Otras cuentas con esta dirección IP:","delete_other_accounts":"Eliminar %{count}","username":"usuario","trust_level":"NC","read_time":"tiempo de lectura","topics_entered":"temas vistos","post_count":"# posts","confirm_delete_other_accounts":"¿Seguro que quieres eliminar estas cuentas?"},"user_fields":{"none":"(selecciona una opción)"},"user":{"said":"{{username}}:","profile":"Perfil","mute":"Silenciar","edit":"Editar Preferencias","download_archive":"Descargar mis posts","new_private_message":"Nuevo mensaje","private_message":"Mensaje","private_messages":"Mensajes","activity_stream":"Actividad","preferences":"Preferencias","expand_profile":"Expandir","bookmarks":"Marcadores","bio":"Acerca de mí","invited_by":"Invitado Por","trust_level":"Nivel de Confianza","notifications":"Notificaciones","desktop_notifications":{"label":"Notificaciones de escritorio","not_supported":"Las notificaciones no están disponibles en este navegador. Lo sentimos.","perm_default":"Activar notificaciones","perm_denied_btn":"Permiso denegado","perm_denied_expl":"Has denegado el permiso para las notificaciones. Usa tu navegador para activarlas, después haz clic en el botón cuando esté hecho. (En escritorio: el icono a la izquierda de la barra de direcciones. En móvil: 'info del sitio'.)","disable":"Desactivar notificaciones","currently_enabled":"(activadas actualmente)","enable":"Activar notificaciones","currently_disabled":"(desactivadas actualmente)","each_browser_note":"Nota: Tendrás que cambiar esta opción para cada navegador que uses."},"dismiss_notifications":"Marcador todos como leídos","dismiss_notifications_tooltip":"Marcar todas las notificaciones no leídas como leídas","disable_jump_reply":"No dirigirme a mi post cuando responda","dynamic_favicon":"Mostrar contador de temas nuevos/actualizados en el favicon","edit_history_public":"Dejar que otros usuarios puedan ver las revisiones de mis posts","external_links_in_new_tab":"Abrir todos los enlaces externos en una nueva pestaña","enable_quoting":"Activar respuesta citando el texto resaltado","change":"cambio","moderator":"{{user}} es un moderador","admin":"{{user}} es un administrador","moderator_tooltip":"Este usuario es un moderador","admin_tooltip":"Este usuario es un administrador","blocked_tooltip":"El usuario está bloqueado","suspended_notice":"Este usuario ha sido suspendido hasta {{date}}.","suspended_reason":"Causa: ","github_profile":"Github","mailing_list_mode":"Enviarme un e-mail para cada nuevo post (excepto las categorías o temas que tenga silenciadas)","watched_categories":"Vigiladas","watched_categories_instructions":"Seguirás automáticamente todos los nuevos temas en estas categorías. Se te notificará de cada nuevo post y tema, y además, se añadirá un contador de posts nuevos y sin leer al lado del tema.","tracked_categories":"Siguiendo","tracked_categories_instructions":"Seguirás automáticamente todos los nuevos temas en estas categorías. Se añadirá un contador de posts nuevos y sin leer al lado del tema.","muted_categories":"Silenciado","muted_categories_instructions":"No serás notificado de ningún tema en estas categorías, y no aparecerán en la página de mensajes recientes.","delete_account":"Borrar Mi Cuenta","delete_account_confirm":"¿Estás seguro que quieres borrar permanentemente tu cuenta? ¡Esta acción no puede ser revertida!","deleted_yourself":"Tu cuenta ha sido borrada exitosamente.","delete_yourself_not_allowed":"No puedes borrar tu cuenta en este momento. Contacta a un administrador para borrar tu cuenta en tu nombre.","unread_message_count":"Mensajes","admin_delete":"Eliminar","users":"Usuarios","muted_users":"Silenciados","muted_users_instructions":"Omite todas las notificaciones de estos usuarios.","muted_topics_link":"Mostrar temas silenciados","automatically_unpin_topics":"Quitar destacado automáticamente cuando el usuario llega al final del tema.","staff_counters":{"flags_given":"reportes útiles","flagged_posts":"posts reportados","deleted_posts":"posts eliminados","suspensions":"suspensiones","warnings_received":"avisos"},"messages":{"all":"Todos","mine":"Míos","unread":"No leídos"},"change_password":{"success":"(e-mail enviado)","in_progress":"(enviando e-mail)","error":"(error)","action":"Enviar E-mail para Restablecer la Contraseña","set_password":"Establecer contraseña"},"change_about":{"title":"Cambiar 'Acerca de mí'","error":"Hubo un error al cambiar este valor."},"change_username":{"title":"Cambiar Nombre de Usuario","confirm":"Si cambias tu nombre de usuario, todas las citas de tus publicaciones y tus menciones desaparecerán. ¿Estás totalmente seguro de querer cambiarlo?","taken":"Lo sentimos, ese nombre de usuario ya está siendo usado.","error":"Ha ocurrido un error al cambiar tu nombre de usuario.","invalid":"Este nombre de usuario no es válido. Debe incluir sólo números y letras"},"change_email":{"title":"Cambiar E-mail","taken":"Lo sentimos, pero ese e-mail no está disponible.","error":"Ha ocurrido un error al cambiar tu email. ¿Tal vez esa dirección ya está en uso?","success":"Te hemos enviado un e-mail a esa dirección. Por favor sigue las instrucciones de confirmación."},"change_avatar":{"title":"Cambiar tu imagen de perfil","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, basado en","gravatar_title":"Cambia tu avatar en la web de Gravatar","refresh_gravatar_title":"Actualizar tu Gravatar","letter_based":"Imagen de perfil asignada por el sistema","uploaded_avatar":"Foto personalizada","uploaded_avatar_empty":"Añade una foto personalizada","upload_title":"Sube tu foto","upload_picture":"Subir Imagen","image_is_not_a_square":"Advertencia: hemos recortado su imagen; la anchura y la altura no eran iguales.","cache_notice":"Has cambiado correctamente tu imagen de perfil pero podría tardar un poco en aparecer debido al caching del navegador."},"change_profile_background":{"title":"Fondo de perfil","instructions":"Fondos de perfil serán centrados y tendrán un ancho por default de 850px."},"change_card_background":{"title":"Fondo de Tarjeta de Usuario","instructions":"Imágenes de fondo serán centrados y tendrán un ancho por default de 590px."},"email":{"title":"E-mail","instructions":"Nunca se mostrará públicamente","ok":"Te enviaremos un email para confirmar","invalid":"Por favor, introduce una dirección de correo válida","authenticated":"Tu dirección de correo ha sido autenticada por {{provider}}","frequency_immediately":"Te enviaremos un email inmediatamente si no has leído aquello que vamos a enviarte.","frequency":{"one":"Sólo te enviaremos emails si no te hemos visto en el último minuto.","other":"Sólo te enviaremos si no te hemos visto en los últimos {{count}} minutos."}},"name":{"title":"Nombre","instructions":"Tu nombre completo (opcional)","instructions_required":"Tu nombre completo","too_short":"Tu nombre es demasiado corto","ok":"Tu nombre es válido"},"username":{"title":"Nombre de usuario","instructions":"Debe ser único, sin espacios y conciso","short_instructions":"Los demás usuarios pueden mencionarte como @{{username}}","available":"Tu nombre de usuario está disponible","global_match":"La dirección coincide con la del nombre de usuario registrado","global_mismatch":"Ya está registrado. ¿Prueba {{suggestion}}?","not_available":"No disponible. ¿Prueba {{suggestion}}?","too_short":"Tu nombre de usuario es demasiado corto","too_long":"Tu nombre de usuario es demasiado largo","checking":"Comprobando la disponibilidad del nombre de usuario...","enter_email":"Nombre de usuario encontrado; introduce la dirección de correo correspondiente","prefilled":"El email coincide con el nombre de usuario registrado"},"locale":{"title":"Idioma de la interfaz","instructions":"El idioma de la interfaz. Cambiará cuando recargues la página.","default":"(por defecto)"},"password_confirmation":{"title":"Introduce de nuevo la contraseña"},"last_posted":"Último post","last_emailed":"Último Enviado por email","last_seen":"Visto por última vez","created":"Creado el","log_out":"Cerrar sesión","location":"Ubicación","card_badge":{"title":"Distintivo de Tarjeta de Usuario"},"website":"Sitio Web","email_settings":"E-mail","email_digests":{"title":"Cuando no visite la página, enviarme un correo con las últimas novedades.","daily":"diariamente","every_three_days":"cada tres días","weekly":"semanalmente","every_two_weeks":"cada dos semanas"},"email_direct":"Envíame un email cuando alguien me cite, responda a mis posts, mencione mi @usuario o me invite a un tema","email_private_messages":"Notifícame por email cuando alguien me envíe un mensaje","email_always":"Quiero recibir notificaciones por email incluso cuando esté de forma activa por el sitio","other_settings":"Otros","categories_settings":"Categorías","new_topic_duration":{"label":"Considerar que los temas son nuevos cuando","not_viewed":"No los he visto todavía","last_here":"creados desde mi última visita","after_1_day":"creados durante el último día ","after_2_days":"creados durante los últimos 2 días","after_1_week":"creados durante la última semana","after_2_weeks":"creados durante las últimas 2 semanas"},"auto_track_topics":"Seguir automáticamente temas en los que entre","auto_track_options":{"never":"nunca","immediately":"inmediatamente","after_30_seconds":"después de 30 segundos","after_1_minute":"después de 1 minuto","after_2_minutes":"después de 2 minutos","after_3_minutes":"después de 3 minutos","after_4_minutes":"después de 4 minutos","after_5_minutes":"después de 5 minutos","after_10_minutes":"después de 10 minutos"},"invited":{"search":"escribe para buscar invitaciones...","title":"Invitaciones","user":"Invitar Usuario","sent":"Enviadas","none":"No hay ninguna invitación pendiente que mostrar.","truncated":{"one":"Mostrando la primera invitación.","other":"Mostrando las primeras {{count}} invitaciones."},"redeemed":"Invitaciones aceptadas","redeemed_tab":"Usado","redeemed_tab_with_count":"Aceptadas ({{count}})","redeemed_at":"Aceptada","pending":"Invitaciones Pendientes","pending_tab":"Pendiente","pending_tab_with_count":"Pendientes ({{count}})","topics_entered":"Temas Vistos","posts_read_count":"Posts leídos","expired":"Esta invitación ha caducado.","rescind":"Remover","rescinded":"Invitación eliminada","reinvite":"Reenviar Invitación","reinvited":"Invitación reenviada","time_read":"Tiempo de Lectura","days_visited":"Días Visitados","account_age_days":"Antigüedad de la cuenta en días","create":"Enviar una Invitación","generate_link":"Copiar Enlace de Invitación","generated_link_message":"\u003cp\u003e¡Enlace de Invitación generado con éxito!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eEste enlace de Invitación es sólo válido para la siguiente dirección de email: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"No has invitado a nadie todavía. Puedes enviar invitaciones individuales o invitar a un grupo de personas a la vez \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003esubiendo un archivo para invitaciones en masa\u003c/a\u003e.","text":"Archivo de Invitación en Masa","uploading":"Subiendo...","success":"Archivo subido correctamente, se te notificará con un mensaje cuando se complete el proceso.","error":"Hubo un error al subir '{{filename}}': {{message}}"}},"password":{"title":"Contraseña","too_short":"Tu contraseña es demasiada corta.","common":"Esa contraseña es demasiado común.","same_as_username":"Tu contraseña es la misma que tu nombre de usuario.","same_as_email":"Tu contraseña es la misma que tu dirección de correo electrónico.","ok":"Tu contraseña es válida.","instructions":"Debe contener al menos %{count} caracteres."},"associated_accounts":"Inicios de sesión","ip_address":{"title":"Última dirección IP"},"registration_ip_address":{"title":"Dirección IP de Registro"},"avatar":{"title":"Imagen de perfil","header_title":"perfil, mensajes, marcadores y preferencias"},"title":{"title":"Título"},"filters":{"all":"Todos"},"stream":{"posted_by":"Publicado por","sent_by":"Enviado por","private_message":"mensaje","the_topic":"el tema"}},"loading":"Cargando...","errors":{"prev_page":"mientras se intentaba cargar","reasons":{"network":"Error de Red","server":"Error del Servidor","forbidden":"Acceso Denegado","unknown":"Error","not_found":"Página no encontrada"},"desc":{"network":"Por favor revisa tu conexión.","network_fixed":"Parece que ha vuelto.","server":"Código de error: {{status}}","forbidden":"No estás permitido para ver eso.","not_found":"¡Ups! la aplicación intentó cargar una URL inexistente.","unknown":"Algo salió mal."},"buttons":{"back":"Volver Atrás","again":"Intentar de Nuevo","fixed":"Cargar Página"}},"close":"Cerrar","assets_changed_confirm":"Este sitio acaba de ser actualizado justo ahora. ¿Quieres recargar la página para ver la última versión?","logout":"Has cerrado sesión.","refresh":"Actualizar","read_only_mode":{"enabled":"Modo solo-lectura activado. Puedes continuar navegando por el sitio pero las interacciones podrían no funcionar.","login_disabled":"Iniciar sesión está desactivado mientras el foro esté en modo solo lectura."},"too_few_topics_and_posts_notice":"¡Vamos a \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003edar por comenzada la comunidad!\u003c/a\u003e Hay \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e temas y \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensajes. Los nuevos visitantes necesitan algo que leer y a lo que responder.","too_few_topics_notice":"¡Vamos a \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003edar por comenzada la comunidad!\u003c/a\u003e Hay \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e temas. Los nuevos visitantes necesitan algo que leer y a lo que responder.","too_few_posts_notice":"¡Vamos a \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003edar por empezada la comunidad!\u003c/a\u003e Hay \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensajes. Los nuevos visitantes necesitan algo que leer y a lo que responder.","learn_more":"saber más...","year":"año","year_desc":"temas creados en los últimos 365 días","month":"mes","month_desc":"temas creados en los últimos 30 días","week":"semana","week_desc":"temas creados en los últimos 7 días","day":"día","first_post":"Primer post","mute":"Silenciar","unmute":"No silenciar","last_post":"Último post","last_reply_lowercase":"última respuesta","replies_lowercase":{"one":"respuesta","other":"respuestas"},"signup_cta":{"sign_up":"Registrarse","hide_session":"Recordar mañana","hide_forever":"no, gracias","hidden_for_session":"Vale, te preguntaremos mañana. Recuerda que también puedes usar el botón 'Iniciar sesión' para crear una cuenta en cualquier momento.","intro":"¡Hola! :heart_eyes: Parece que estás interesado en las cosas que nuestros usuarios publican, pero no tienes una cuenta registrada.","value_prop":"Cuando te registras, recordamos lo que has leído, para que puedas volver justo donde estabas leyendo. También recibes notificaciones, por aquí y por email, cuando se publican nuevos mensajes. ¡También puedes darle a Me gusta a los mensajes! :heartbeat:"},"summary":{"enabled_description":"Estás viendo un resumen de este tema: los posts más interesantes determinados por la comunidad.","description":"Hay \u003cb\u003e{{count}}\u003c/b\u003e respuestas.","description_time":"Hay \u003cb\u003e{{count}}\u003c/b\u003e respuestas con un tiempo de lectura estimado de \u003cb\u003e{{readingTime}} minutos\u003c/b\u003e.","enable":"Resumir este Tema","disable":"Ver Todos los Posts"},"deleted_filter":{"enabled_description":"Este tema contiene posts eliminados, los cuales han sido ocultados.","disabled_description":"Se están mostrando los posts eliminados de este tema. ","enable":"Ocultar Posts Eliminados","disable":"Mostrar Posts Eliminados"},"private_message_info":{"title":"Mensaje","invite":"Invitar a Otros...","remove_allowed_user":"¿Seguro que quieres eliminar a {{name}} de este mensaje?"},"email":"E-mail","username":"Nombre de usuario","last_seen":"Visto por última vez","created":"Creado","created_lowercase":"creado","trust_level":"Nivel de Confianza","search_hint":"usuario, email o dirección IP","create_account":{"title":"Crear nueva cuenta","failed":"Algo ha salido mal, tal vez este e-mail ya fue registrado, intenta con el enlace 'olvidé la contraseña'"},"forgot_password":{"title":"Restablecer contraseña","action":"Olvidé mi contraseña","invite":"Introduce tu nombre de usuario o tu dirección de e-mail, y te enviaremos un correo electrónico para cambiar tu contraseña.","reset":"Restablecer Contraseña","complete_username":"Si una cuenta coincide con el nombre de usuario \u003cb\u003e%{username}\u003c/b\u003e, dentro de poco deberías recibir un e-mail con las instrucciones para cambiar tu contraseña.","complete_email":"Si una cuenta coincide con \u003cb\u003e%{email}\u003c/b\u003e, dentro de poco deberías recibir un e-mail con las instrucciones para cambiar tu contraseña.","complete_username_found":"Encontramos una cuenta que coincide con el usuario \u003cb\u003e%{username}\u003c/b\u003e, deberías recibir en breve un e-mail con instrucciones para restablecer tu contraseña.","complete_email_found":"Encontramos una cuenta que coincide con el e-mail \u003cb\u003e%{email}\u003c/b\u003e, deberías recibir en breve un e-mail con instrucciones para restablecer tu contraseña.","complete_username_not_found":"Ninguna cuenta concuerda con el nombre de usuario \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Ninguna cuenta concuerda con \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Iniciar Sesión","username":"Usuario","password":"Contraseña","email_placeholder":"dirección de e-mail o nombre de usuario","caps_lock_warning":"Está activado Bloqueo de Mayúsculas","error":"Error desconocido","rate_limit":"Por favor, espera un poco antes de volver a intentar iniciar sesión.","blank_username_or_password":"Por favor, introducir tu e-mail o usuario, y tu contraseña.","reset_password":"Restablecer Contraseña","logging_in":"Iniciando Sesión","or":"O","authenticating":"Autenticando...","awaiting_confirmation":"Tu cuenta está pendiente de activación, usa el enlace de 'olvidé contraseña' para recibir otro e-mail de activación.","awaiting_approval":"Tu cuenta todavía no ha sido aprobada por un moderador. Recibirás un e-mail cuando sea aprobada.","requires_invite":"Lo sentimos pero solo se puede acceder a este foro mediante invitación.","not_activated":"No puedes iniciar sesión todavía. Anteriormente te hemos enviado un email de activación a \u003cb\u003e{{sentTo}}\u003c/b\u003e. Por favor sigue las instrucciones en ese email para activar tu cuenta.","not_allowed_from_ip_address":"No puedes iniciar sesión desde esa dirección IP.","admin_not_allowed_from_ip_address":"No puedes iniciar sesión como admin desde esta dirección IP.","resend_activation_email":"Has clic aquí para enviar el email de activación nuevamente.","sent_activation_email_again":"Te hemos enviado otro e-mail de activación a \u003cb\u003e{{currentemail}}\u003c/b\u003e. Podría tardar algunos minutos en llegar; asegúrate de revisar tu carpeta de spam.","to_continue":"Por favor, inicia sesión","preferences":"Debes tener una sesión iniciada para cambiar tus preferencias de usuario.","forgot":"No me acuerdo de los detalles de mi cuenta.","google":{"title":"con Google","message":"Autenticando con Google (asegúrate de desactivar cualquier bloqueador de pop ups)"},"google_oauth2":{"title":"con Google","message":"Autenticando con Google (asegúrate de no tener habilitados bloqueadores de pop-up)"},"twitter":{"title":"con Twitter","message":"Autenticando con Twitter (asegúrate de desactivar cualquier bloqueador de pop ups)"},"facebook":{"title":"con Facebook","message":"Autenticando con Facebook (asegúrate de desactivar cualquier bloqueador de pop ups)"},"yahoo":{"title":"con Yahoo","message":"Autenticando con Yahoo (asegúrate de desactivar cualquier bloqueador de pop ups)"},"github":{"title":"con GitHub","message":"Autenticando con GitHub (asegúrate de desactivar cualquier bloqueador de pop ups)"}},"apple_international":"Apple/Internacional","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"más...","options":"Opciones","whisper":"susurrar","add_warning":"Ésta es una advertencia oficial.","toggle_whisper":"Activar/desactivar Susurro","posting_not_on_topic":"¿A qué tema quieres responder?","saving_draft_tip":"guardando...","saved_draft_tip":"guardado","saved_local_draft_tip":"guardado localmente","similar_topics":"Tu tema es similar a...","drafts_offline":"borradores offline","error":{"title_missing":"Es necesario un título","title_too_short":"El título debe ser por lo menos de {{min}} caracteres.","title_too_long":"El título no puede tener más de {{max}} caracteres.","post_missing":"El post no puede estar vacío.","post_length":"El post debe tener por lo menos {{min}} caracteres.","try_like":"¿Has probado el botón de \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Debes escoger una categoría."},"save_edit":"Guardar edición","reply_original":"Responder en el Tema Original","reply_here":"Responder Aquí","reply":"Responder","cancel":"Cancelar","create_topic":"Crear tema","create_pm":"Mensaje","title":"O pulsa Ctrl+Intro","users_placeholder":"Añadir usuario","title_placeholder":"En una frase breve, ¿de qué trata este tema?","edit_reason_placeholder":"¿Por qué lo estás editando?","show_edit_reason":"(añadir motivo de edición)","reply_placeholder":"Escribe aquí. Usa Markdown, BBCode o HTML para darle formato. Arrastra o pega imágenes.","view_new_post":"Ver tu nuevo post.","saving":"Guardando","saved":"¡Guardado!","saved_draft":"Borrador en progreso. Selecciona para continuar.","uploading":"Subiendo...","show_preview":"mostrar vista previa \u0026raquo;","hide_preview":"\u0026laquo; ocultar vista previa","quote_post_title":"Citar todo el post","bold_title":"Negrita","bold_text":"Texto en negrita","italic_title":"Cursiva","italic_text":"Texto en cursiva","link_title":"Hipervínculo","link_description":"introduzca descripción del enlace aquí","link_dialog_title":"Insertar Enlace","link_optional_text":"título opcional","link_placeholder":"http://ejemplo.com \"texto opcional\"","quote_title":"Cita","quote_text":"Cita","code_title":"Texto preformateado","code_text":"texto preformateado precedido por 4 espacios","upload_title":"Subir","upload_description":"introduce una descripción de la imagen aquí","olist_title":"Lista numerada","ulist_title":"Lista con viñetas","list_item":"Lista de ítems","heading_title":"Encabezado","heading_text":"Encabezado","hr_title":"Linea Horizontal","help":"Ayuda de Edición con Markdown","toggler":"ocultar o mostrar el panel de edición","modal_ok":"OK","modal_cancel":"Cancelar","cant_send_pm":"Lo sentimos, no puedes enviar un mensaje a %{username}.","admin_options_title":"Opciones de moderación para este tema","auto_close":{"label":"Tiempo para cierre automático del tema","error":"Por favor introduzca un valor válido.","based_on_last_post":"No cerrar hasta que el último post en el tema es al menos así de antiguo.","all":{"examples":"Introduzca el número de horas (24), tiempo absoluto (17:30) o timestamp (2013-11-22 14:00)."},"limited":{"units":"(# de horas)","examples":"Introduzca el número de horas (24)."}}},"notifications":{"title":"notificaciones por menciones a tu @nombre, respuestas a tus posts y temas, mensajes, etc","none":"No se han podido cargar las notificaciones.","more":"ver notificaciones antiguas","total_flagged":"total de posts reportados","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e ha aceptado tu invitación\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e movió {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eSe te ha concedido '{{description}}'\u003c/p\u003e","alt":{"mentioned":"Mencionado por","quoted":"Citado por","replied":"Respondido","posted":"Publicado por","edited":"Editado tu post por","liked":"Gustado tu post","private_message":"Mensaje privado de","invited_to_private_message":"Invitado a un mensaje privado de","invited_to_topic":"Invitado a un tema de","invitee_accepted":"Invitación aceptada por","moved_post":"Tu post fue eliminado por","linked":"Enlace a tu post","granted_badge":"Distintivo concedido"},"popup":{"mentioned":"{{username}} te mencionó en \"{{topic}}\" - {{site_title}}","quoted":"{{username}} te citó en \"{{topic}}\" - {{site_title}}","replied":"{{username}} te respondió en \"{{topic}}\" - {{site_title}}","posted":"{{username}} publicó en \"{{topic}}\" - {{site_title}}","private_message":"{{username}} te envió un mensaje privado en \"{{topic}}\" - {{site_title}}","linked":"{{username}} enlazó tu publicación desde \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Añadir imagen","title_with_attachments":"Añadir una imagen o archivo","from_my_computer":"Desde mi dispositivo","from_the_web":"Desde la web","remote_tip":"enlace a la imagen","remote_tip_with_attachments":"enlace a imagen o archivo {{authorized_extensions}}","local_tip":"selecciona las imágenes desde tu dispositivo","local_tip_with_attachments":"selecciona imágenes o archivos desde tu dispositivo {{authorized_extensions}}","hint":"(también puedes arrastrarlos al editor para subirlos)","hint_for_supported_browsers":"puedes también arrastrar o pegar imágenes en el editor","uploading":"Subiendo","select_file":"Selecciona Archivo","image_link":"el link de tu imagen apuntará a"},"search":{"sort_by":"Ordenar por","relevance":"Relevancia","latest_post":"Post más reciente","most_viewed":"Más visto","most_liked":"Más \"Me gusta\" recibidos","select_all":"Seleccionar todo","clear_all":"Limpiar todo","result_count":{"one":"1 resultado para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} resultados para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"buscar temas, posts, usuarios o categorías","no_results":"No se ha encontrado ningún resultado.","no_more_results":"No se encontraron más resultados.","search_help":"Ayuda para buscar","searching":"Buscando ...","post_format":"#{{post_number}} por {{username}}","context":{"user":"Buscar posts por @{{username}}","category":"Buscar en la categoría \"{{category}}\"","topic":"Buscar en este tema","private_messages":"Buscar en mensajes"}},"hamburger_menu":"ir a otra lista de temas o categoría","new_item":"nuevo","go_back":"volver","not_logged_in_user":"página con el resumen de actividad y preferencias","current_user":"ir a tu página de usuario","topics":{"bulk":{"unlist_topics":"Hacer invisibles","reset_read":"Restablecer leídos","delete":"Eliminar temas","dismiss":"Descartar","dismiss_read":"Descartar todos los temas no leídos","dismiss_button":"Descartar...","dismiss_tooltip":"Descartar solo los nuevos posts o dejar de seguir los temas","also_dismiss_topics":"¿Dejar de seguir estos temas? (No aparecerán más en la pestaña no leídos)","dismiss_new":"Ignorar nuevos","toggle":"activar selección de temas en bloque","actions":"Acciones en bloque","change_category":"Cambiar categoría","close_topics":"Cerrar temas","archive_topics":"Archivar temas","notification_level":"Cambiar el Nivel de Notificación","choose_new_category":"Elige una nueva categoría para los temas:","selected":{"one":"Has seleccionado \u003cb\u003e1\u003c/b\u003e tema.","other":"Has seleccionado \u003cb\u003e{{count}}\u003c/b\u003e temas."}},"none":{"unread":"No hay temas que sigas y que no hayas leído ya.","new":"No tienes temas nuevos por leer.","read":"Todavía no has leído ningún tema.","posted":"Todavía no has publicado en ningún tema.","latest":"No hay temas recientes. Qué pena...","hot":"No hay temas calientes nuevos.","bookmarks":"No tienes temas guardados en marcadores todavía.","category":"No hay temas en la categoría {{category}}.","top":"No hay temas en el top más vistos.","search":"No hay resultados de búsqueda.","educate":{"new":"\u003cp\u003eTus nuevos temas aparecerán aquí.\u003c/p\u003e\u003cp\u003ePor defecto, los temas son considerados nuevos y mostrarán un indicador: \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enuevo\u003c/span\u003e si son creados en los 2 últimos días.\u003c/p\u003e\u003cp\u003ePuedes cambiar esto en tus \u003ca href=\"%{userPrefsUrl}\"\u003epreferencias\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eTus temas sin leer aparecerán aquí.\u003c/p\u003e\u003cp\u003ePor defecto, los temas son considerados no leídos y mostrán contadores de post sin leer \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e si:\u003c/p\u003e\u003cul\u003e\u003cli\u003eCreaste el tema\u003c/li\u003e\u003cli\u003eRespondiste al tema\u003c/li\u003e\u003cli\u003eLeíste el tema durante más de 4 minutos\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eO si has establecido específicamente el tema a Seguir o Vigilar en el control de notificaciones al pie de cada tema.\u003c/p\u003e\u003cp\u003ePuedes cambiar esto en tus \u003ca href=\"%{userPrefsUrl}\"\u003epreferencias\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"No hay más temas recientes para leer.","hot":"No hay más temas calientes.","posted":"No hay más temas publicados.","read":"No hay más temas leídos.","new":"No hay más nuevos temas.","unread":"No hay más temas que no hayas leído.","category":"No hay más temas en la categoría {{category}}.","top":"No hay más temas en el top más vistos.","bookmarks":"No hay más temas guardados en marcadores.","search":"No hay más resultados de búsqueda."}},"topic":{"unsubscribe":{"stop_notifications":"Ahora recibirás menos notificaciones desde \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"El estado actual de notificación para ti es"},"filter_to":"{{post_count}} posts en este tema","create":"Crear tema","create_long":"Crear un nuevo tema","private_message":"Empezar un mensaje","list":"Temas","new":"nuevo tema","unread":"No leídos","new_topics":{"one":"1 tema nuevo","other":"{{count}} temas nuevos"},"unread_topics":{"one":"1 tema sin leer","other":"{{count}} temas sin leer"},"title":"Tema","invalid_access":{"title":"Este tema es privado","description":"Lo sentimos, ¡no tienes acceso a este tema!","login_required":"Tienes que iniciar sesión para poder ver este tema."},"server_error":{"title":"El tema falló al intentar ser cargado","description":"Lo sentimos, no pudimos cargar el tema, posiblemente debido a problemas de conexión. Por favor, inténtalo nuevamente. Si el problema persiste, por favor contacta con soporte."},"not_found":{"title":"Tema no encontrado","description":"Lo sentimos, no pudimos encontrar ese tema. ¿Tal vez fue eliminado por un moderador?"},"total_unread_posts":{"one":"tienes 1 publicación sin leer en este tema","other":"tienes {{count}} publicaciones sin leer en este tema"},"unread_posts":{"one":"tienes 1 post antiguo sin leer en este tema","other":"tienes {{count}} posts antiguos sin leer en este tema"},"new_posts":{"one":"hay 1 nuevo post en este tema desde la última vez que lo leíste","other":"hay {{count}} posts nuevos en este tema desde la última vez que lo leíste"},"likes":{"one":"este tema le gusta a 1 persona","other":"este tema les gusta a {{count}} personas"},"back_to_list":"Volver a la Lista de Temas","options":"Opciones del Tema","show_links":"mostrar enlaces dentro de este tema","toggle_information":"detalles del tema","read_more_in_category":"¿Quieres leer más? Consulta otros temas en {{catLink}} o {{latestLink}}.","read_more":"¿Quieres leer más? {{catLink}} o {{latestLink}}.","browse_all_categories":"Ver todas las categorías","view_latest_topics":"ver los temas recientes","suggest_create_topic":"¿Por qué no creas un tema?","jump_reply_up":"saltar a la primera respuesta","jump_reply_down":"saltar a la última respuesta","deleted":"El tema ha sido borrado","auto_close_notice":"Este tema se cerrará automáticamente en %{timeLeft}.","auto_close_notice_based_on_last_post":"Este tema cerrara %{duration} después de la última respuesta.","auto_close_title":"Configuración de auto-cerrado","auto_close_save":"Guardar","auto_close_remove":"No Auto-Cerrar Este Tema","progress":{"title":"avances","go_top":"arriba","go_bottom":"abajo","go":"ir","jump_bottom":"salta al último post","jump_bottom_with_number":"saltar al post %{post_number}","total":"posts totales","current":"post actual","position":"post %{current} de %{total}"},"notifications":{"reasons":{"3_6":"Recibirás notificaciones porque estás vigilando esta categoría.","3_5":"Recibirás notificaciones porque has empezado a vigilar este tema automáticamente.","3_2":"Recibirás notificaciones porque estás vigilando este tema.","3_1":"Recibirás notificaciones porque creaste este tema.","3":"Recibirás notificaciones porque estás vigilando este tema.","2_8":"Recibirás notificaciones porque estás siguiendo esta categoría.","2_4":"Recibirás notificaciones porque has publicado una respuesta en este tema.","2_2":"Recibirás notificaciones porque estás siguiendo este tema.","2":"Recibirás notificaciones porque \u003ca href=\"/users/{{username}}/preferences\"\u003ehas leído este tema\u003c/a\u003e.","1_2":"Se te notificará solo si alguien menciona tu @nombre o te responde a un post.","1":"Se te notificará si alguien menciona tu @nombre o te responde a un post.","0_7":"Estás ignorando todas las notificaciones en esta categoría.","0_2":"Estás ignorando todas las notificaciones en este tema.","0":"Estás ignorando todas las notificaciones en este tema."},"watching_pm":{"title":"Vigilar","description":"Se te notificará de cada nuevo post en este mensaje y se mostrará un contador de nuevos posts."},"watching":{"title":"Vigilar","description":"Se te notificará de cada post en este tema y se mostrará un contador de nuevos post."},"tracking_pm":{"title":"Seguir","description":"Se mostrará un contador de nuevos posts para este mensaje y se te notificará si alguien menciona tu @nombre o te responde a un post."},"tracking":{"title":"Seguir","description":"Se mostrará un contador de nuevos posts en este tema y se te notificará si alguien menciona tu @nombre o te responde a un post."},"regular":{"title":"Normal","description":"Se te notificará solo si alguien menciona tu @nombre o te responde a un post."},"regular_pm":{"title":"Normal","description":"Se te notificará solo si alguien menciona tu @nombre o te responde a un post."},"muted_pm":{"title":"Silenciar","description":"Nunca se te notificará nada sobre este hilo de mensajes."},"muted":{"title":"Silenciar","description":"No serás notificado de algo relacionado con este tema, y no aparecerá en la página de mensajes recientes."}},"actions":{"recover":"Deshacer borrar tema","delete":"Eliminar tema","open":"Abrir tema","close":"Cerrar tema","multi_select":"Seleccionar posts...","auto_close":"Auto-cierre...","pin":"Destacar tema...","unpin":"Dejar de destacar...","unarchive":"Desarchivar Tema","archive":"Archivar Tema","invisible":"Hacer invisible","visible":"Hacer visible","reset_read":"Restablecer datos de lectura"},"feature":{"pin":"Destacar tema","unpin":"Dejar de destacar tema","pin_globally":"Destacar tema globalmente","make_banner":"Tema de encabezado","remove_banner":"Remover tema de encabezado"},"reply":{"title":"Responder","help":"comienza a escribir una respuesta a este tema"},"clear_pin":{"title":"Eliminar Destacado","help":"Elimina el estado 'Destacado' de este tema para que no aparezca más en lo más alto de tu lista de temas"},"share":{"title":"Compartir","help":"comparte el enlace a este tema"},"flag_topic":{"title":"Reportar","help":"reportar de forma privada para atención de los moderadores o enviar una notificación privada sobre él","success_message":"Has reportado este tema correctamente."},"feature_topic":{"title":"Característica de este Tema","pin":"Hacer que este tema aparezca en el top de la categoría {{categoryLink}} hasta","confirm_pin":"Hay ya {{count}} temas destacados. Que haya demasiados temas destacados puede resultar engorroso para los usuarios nuevos y anónimos. ¿Seguro que quieres destacar otro tema en esta categoría?","unpin":"Eliminar este tema del top de la categoría {{categoryLink}}.","unpin_until":"Quitar este tema del top de la categoría {{categoryLink}} o esperar al \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Los usuarios pueden desanclar el tema de forma individual por sí mismos.","pin_validation":"Es obligatorio especificar una fecha para destacar este tema.","not_pinned":"No hay temas destacados en {{categoryLink}}.","already_pinned":{"one":"Hay \u003cstrong class='badge badge-notification unread'\u003eun tema\u003c/strong\u003e destacado actualmente en {{categoryLink}}. ","other":"Temas destacados actualmente en {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Hacer que este tema aparezca en el top de todas las listas de temas hasta","confirm_pin_globally":"Hay ya {{count}} temas destacados globalmente. Que haya demasiados temas destacados puede resultar engorroso para los usuarios nuevos y anónimos. ¿Seguro que quieres destacar otro tema de forma global?","unpin_globally":"Eliminar este tema de la parte superior de todas las listas de temas.","unpin_globally_until":"Quitar este tema del top de todas las listas de temas o esperar al \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Los usuarios pueden desanclar el tema de forma individual por sí mismos.","not_pinned_globally":"No hay temas destacados globalmente.","already_pinned_globally":{"one":"Actualmente hay \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e tema destacado globalmente.","other":"Temas destacados globalmente: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Hacer de este tema una pancarta que aparece en la parte superior de todas las páginas.","remove_banner":"Retire la pancarta que aparece en la parte superior de todas las páginas.","banner_note":"Los usuarios pueden descartar la pancarta cerrándola. Sólo un tema puede ser una pancarta en cualquier momento dado.","no_banner_exists":"No hay tema de encabezado (banner).","banner_exists":"Actualmente \u003cstrong class='badge badge-notification unread'\u003ehay\u003c/strong\u003e un tema de encabezado (banner)."},"inviting":"Invitando...","automatically_add_to_groups_optional":"Esta invitación incluye además acceso a estos grupos: (opcional, solo administradores)","automatically_add_to_groups_required":"Esta invitación incluye además acceso a estos grupos: (\u003cb\u003eRequerido\u003c/b\u003e, solo administradores)","invite_private":{"title":"Invitar al hilo de mensajes.","email_or_username":"Email o nombre de usuario del invitado","email_or_username_placeholder":"dirección de email o nombre de usuario","action":"Invitar","success":"Hemos invitado a ese usuario a participar en este hilo de mensajes.","error":"Lo sentimos, hubo un error al invitar a ese usuario.","group_name":"nombre del grupo"},"invite_reply":{"title":"Invitar","username_placeholder":"nombre de usuario","action":"Enviar invitación","help":"invitar a otros a este tema a través del correo electrónico o de las notificaciones","to_forum":"Enviaremos un correo electrónico breve permitiendo a tu amigo unirse inmediatamente al hacer clic en un enlace, sin necesidad de iniciar sesión.","sso_enabled":"Introduce el nombre de usuario de la persona a la que quieres invitar a este tema.","to_topic_blank":"Introduzca el nombre de usuario o dirección de correo electrónico de la persona que desea invitar a este tema.","to_topic_email":"Ha introducido una dirección de correo electrónico. Nosotros te enviaremos una invitación que le permita a su amigo responder inmediatamente a este tema.","to_topic_username":"Has introducido un nombre de usuario. Le enviaremos una notificación con un enlace invitándole a este tema.","to_username":"Introduce el nombre de usuario de la persona a la que quieras invitar. Le enviaremos una notificación con un enlace invitándole a este tema.","email_placeholder":"nombre@ejemplo.com","success_email":"Hemos enviado un email con tu invitación a \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Te notificaremos cuando se acepte. Puedes revisar la pestaña invitaciones en tu perfil de usuario para consultar el estado de tus invitaciones.","success_username":"Hemos invitado a ese usuario a participar en este tema.","error":"Lo sentimos, no pudimos invitar a esa persona. Tal vez ya haya sido invitada. (La tasa de invitaciones es limitada)"},"login_reply":"Inicia Sesión para Responder","filters":{"n_posts":{"one":"1 post","other":"{{count}} posts"},"cancel":"Quitar filtro"},"split_topic":{"title":"Mover a un tema nuevo","action":"mover a un tema nuevo","topic_name":"Nombre del tema nuevo","error":"Hubo un error moviendo los posts al nuevo tema","instructions":{"one":"Estas a punto de crear un tema nuevo y rellenarlo con el post que has seleccionado.","other":"Estas a punto de crear un tema nuevo y rellenarlo con los \u003cb\u003e{{count}}\u003c/b\u003e posts que has seleccionado."}},"merge_topic":{"title":"Mover a un tema existente","action":"mover a un tema existente","error":"Hubo un error moviendo los posts a ese tema","instructions":{"one":"Por favor escoge el tema al que quieres mover ese post.","other":"Por favor escoge el tema al que quieres mover esos \u003cb\u003e{{count}}\u003c/b\u003e posts."}},"change_owner":{"title":"Cambiar dueño de los posts","action":"cambiar dueño","error":"Hubo un error cambiando la autoría de los posts.","label":"Nuevo dueño de los posts","placeholder":"nombre de usuario del nuevo dueño","instructions":{"one":"Por favor escoge el nuevo dueño del {{count}} post de \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Por favor escoge el nuevo dueño de los {{count}} posts de \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Ten en cuenta que las notificaciones sobre este post no serán transferidas al nuevo usuario de forma retroactiva.\u003cbr\u003eAviso: actualmente, los datos que no dependen del post son transferidos al nuevo usuario. Usar con precaución."},"change_timestamp":{"title":"Cambiar Timestamp","action":"cambiar timestamp","invalid_timestamp":"El Timestamp no puede ser futuro","error":"Hubo un error cambiando el timestamp de este tema.","instructions":"Por favor, señecciona el nuevo timestamp del tema. Los posts en el tema serán actualizados para mantener la diferencia de tiempo."},"multi_select":{"select":"seleccionar","selected":"seleccionado ({{count}})","select_replies":"seleccionar más respuestas","delete":"eliminar seleccionado","cancel":"cancelar selección","select_all":"seleccionar todo","deselect_all":"deshacer selección","description":{"one":"Has seleccionado \u003cb\u003e1\u003c/b\u003e post.","other":"Has seleccionado \u003cb\u003e{{count}}\u003c/b\u003e posts."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"citar","edit":"Editando {{link}} {{replyAvatar}} {{username}}","edit_reason":"Motivo:","post_number":"post {{number}}","last_edited_on":"post editado por última ven en","reply_as_new_topic":"Responder como tema enlazado","continue_discussion":"Continuando la discusión desde {{postLink}}:","follow_quote":"ir al post citado","show_full":"Mostrar todo el post","show_hidden":"Ver el contenido oculto.","deleted_by_author":{"one":"(post retirado por el autor. Será borrado automáticamente en %{count} hora si no es reportado)","other":"(post retirado por el autor. Será borrado automáticamente en %{count} horas si no es reportado)"},"expand_collapse":"expandir/contraer","gap":{"one":"ver 1 post oculto","other":"ver {{count}} posts ocultos"},"more_links":"{{count}} más...","unread":"Post sin leer","has_replies":{"one":"{{count}} Respuesta","other":"{{count}} Respuestas"},"has_likes":{"one":"{{count}} Me gusta","other":"{{count}} Me gusta"},"has_likes_title":{"one":"1 persona le ha dado Me gusta a este post","other":"{{count}} personas le han dado Me gusta a este post"},"has_likes_title_only_you":"te ha gustado este mensaje","has_likes_title_you":{"one":"A tí y a una persona le ha gustado este mensaje","other":"A tí y a otros {{count}} les han gustado este mensaje"},"errors":{"create":"Lo sentimos, hubo un error al crear tu post. Por favor, inténtalo de nuevo.","edit":"Lo sentimos, hubo un error al editar tu post. Por favor, inténtalo de nuevo.","upload":"Lo sentimos, hubo un error al subir el archivo. Por favor, inténtalo de nuevo.","attachment_too_large":"Lo siento, el archivo que estas intentando subir es demasiado grande (el tamaño máximo es {{max_size_kb}}kb).","file_too_large":"Lo sentimos, el archivo que estas tratando de subir es demasiado grande (el tamaño máximo es de {{max_size_kb}}kb)","too_many_uploads":"Lo siento solo puedes subir un archivo cada vez.","too_many_dragged_and_dropped_files":"Lo sentimos, solo puedes arrastrar 10 archivos a la vez.","upload_not_authorized":"Lo sentimos, el archivo que intenta cargar no está autorizado (authorized extension: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Lo siento, usuarios nuevos no pueden subir imágenes.","attachment_upload_not_allowed_for_new_user":"Lo siento, usuarios nuevos no pueden subir archivos adjuntos.","attachment_download_requires_login":"Lo sentimos, necesitas haber iniciado sesión para descargar archivos adjuntos."},"abandon":{"confirm":"¿Estás seguro que deseas abandonar tu post?","no_value":"No, mantener","yes_value":"Sí, abandonar"},"via_email":"este post llegó por email","whisper":"esto post es un susurro privado para moderadores","wiki":{"about":"Este post es tipo wiki, cualquier usuario registrado puede editarlo"},"archetypes":{"save":"Guardar opciones"},"controls":{"reply":"componer una respuesta para este post","like":"me gusta este post","has_liked":"te gusta este post","undo_like":"deshacer Me gusta","edit":"edita este post","edit_anonymous":"Lo sentimos, necesitas iniciar sesión para editar este post.","flag":"reporta esta publicación de forma privada para atención de los moderadores o enviarles un notificación privada sobre el tema","delete":"elimina este post","undelete":"deshace la eliminación de este post","share":"comparte un enlace a este post","more":"Más","delete_replies":{"confirm":{"one":"¿Quieres eliminar también la respuesta directa a este post?","other":"¿Quieres eliminar también las {{count}} respuestas directas a este post?"},"yes_value":"Sí, borrar también las respuestas","no_value":"No, solo este post"},"admin":"acciones de administrador para el post","wiki":"Formato wiki","unwiki":"Deshacer formato wiki","convert_to_moderator":"Convertir a post de staff","revert_to_regular":"Eliminar el formato de post de staff","rebake":"Reconstruir HTML","unhide":"Deshacer ocultar","change_owner":"Cambiar dueño"},"actions":{"flag":"Reportar","defer_flags":{"one":"Aplazar reporte","other":"Aplazar reportes"},"it_too":{"off_topic":"Reportar de esto también","spam":"Reportar de esto también","inappropriate":"Reportar de esto también","custom_flag":"Reportar de esto también","bookmark":"Guardarlo también como favorito","like":"Dale también un Me gusta","vote":"Vota por esto también"},"undo":{"off_topic":"Deshacer reporte","spam":"Deshacer reporte","inappropriate":"Deshacer reporte","bookmark":"Deshacer marcador","like":"Deshacer Me gusta","vote":"Deshacer voto"},"people":{"off_topic":"{{icons}} reportó esto como off-topic","spam":"{{icons}} reportó esto como spam","spam_with_url":"{{icons}} reportó \u003ca href='{{postUrl}}'\u003eesto como spam\u003c/a\u003e","inappropriate":"{{icons}} flagged reportó esto como inapropiado","notify_moderators":"{{icons}} ha notificado a los moderadores","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003emoderadores notificados\u003c/a\u003e","notify_user":"{{icons}} ha enviado un mensaje","notify_user_with_url":"{{icons}} ha enviado un \u003ca href='{{postUrl}}'\u003emensaje\u003c/a\u003e","bookmark":"{{icons}} ha marcado esto","like":"{{icons}} les gusta esto","vote":"{{icons}} ha votado esto"},"by_you":{"off_topic":"Has reportado esto como off-topic","spam":"Has reportado esto como Spam","inappropriate":"Has reportado esto como inapropiado","notify_moderators":"Has reportado esto para que sea moderado","notify_user":"Has enviado un mensaje a este usuario","bookmark":"Has marcado este post","like":"Te ha gustado esto","vote":"Has votado este post"},"by_you_and_others":{"off_topic":{"one":"Tú y otro usuarios habéis reportado esto como off-topic","other":"Tú y otros {{count}} usuarios habéis reportado esto como off-topic"},"spam":{"one":"Tú y otro usuario habéis reportado esto como off-topic","other":"Tú y otros {{count}} usuarios habéis reportado esto como spam"},"inappropriate":{"one":"Tú y otro usuario habéis reportado esto como inapropiado","other":"Tú y otros {{count}} usuarios habéis reportado esto como inapropiado"},"notify_moderators":{"one":"Tú y otro usuario habéis reportado esto para moderar","other":"Tú y otros {{count}} usuarios habéis reportado esto para moderar"},"notify_user":{"one":"Tú y otra persona habéis enviado un mensaje a este usuario","other":"Tú y otras {{count}} personas habéis enviado un mensaje a este usuario"},"bookmark":{"one":"Tú y otro usuario habéis marcado este post","other":"Tú y otros {{count}} usuarios habéis marcado este post"},"like":{"one":"A ti y a otro usuario os ha gustado esto","other":"A ti y a otros {{count}} usuarios os ha gustado esto"},"vote":{"one":"Tú y otro usuario habéis votado este post","other":"Tú y otros {{count}} habéis votado este post"}},"by_others":{"off_topic":{"one":"1 usuario ha reportado esto como off-topic","other":"{{count}} usuarios han reportado esto como off-topic"},"spam":{"one":"1 usuario ha reportado esto como spam","other":"{{count}} usuarios han reportado esto como spam"},"inappropriate":{"one":"1 usuario ha reportado esto como inapropiado","other":"{{count}} usuarios han reportado esto como inapropiado"},"notify_moderators":{"one":"1 usuario ha reportado esto para que sea moderado","other":"{{count}} usuarios han reportado esto para que sea moderado"},"notify_user":{"one":"1 persona ha enviado un mensaje a este usuario","other":"{{count}} personas han enviado un mensaje a este usuario"},"bookmark":{"one":"Una persona ha marcado este post","other":"{{count}} han marcado este post"},"like":{"one":"A 1 persona le gusta esto","other":"A {{count}} personas les gusta esto"},"vote":{"one":"Una persona ha votado este post","other":"{{count}} personas votaron este post"}}},"delete":{"confirm":{"one":"¿Seguro que quieres eliminar ese post?","other":"¿Seguro que quieres eliminar todos esos posts?"}},"revisions":{"controls":{"first":"Primera revisión","previous":"Revisión anterior","next":"Siguiente revisión","last":"Última revisión","hide":"Ocultar revisión.","show":"Mostrar revisión.","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Muestra la producción asistida con adiciones y eleminaciones en línea","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Mostrar la producción asistida estas de lado a lado","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Mostrar las diferencias crudas a la par","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Crudo"}}}},"category":{"can":"puede\u0026hellip; ","none":"(sin categoría)","all":"Todas las categorías","choose":"Seleccionar una categoría\u0026hellip;","edit":"editar","edit_long":"Editar","view":"Ver temas en la categoría","general":"General","settings":"Ajustes","topic_template":"Plantilla de tema","delete":"Eliminar categoría","create":"Crear categoría","create_long":"Crear una nueva categoría","save":"Guardar categoría","slug":"Slug de la categoría para URL","slug_placeholder":"(Opcional) palabras-por-guiones para URL","creation_error":"Se ha producido un error al crear la categoría.","save_error":"Ha ocurrido un error al guardar la categoría","name":"Nombre de la categoría","description":"Descripción","topic":"categoría","logo":"Imagen (logo) para la categoría","background_image":"Imagen de fondo para la categoría","badge_colors":"Colores de los distintivos","background_color":"Color de fondo","foreground_color":"Colores de primer plano","name_placeholder":"Debe ser corto y conciso.","color_placeholder":"Cualquier color web","delete_confirm":"¿Estás seguro de que quieres eliminar esta categoría?","delete_error":"Ha ocurrido un error al borrar la categoría.","list":"Lista de categorías","no_description":"Por favor, añade una descripción para esta categoría.","change_in_category_topic":"Editar descripción","already_used":"Este color ha sido usado para otra categoría","security":"Seguridad","special_warning":"Aviso: esta categoría se ajusta por defecto y las opciones de seguridad no pueden ser editadas. Si no deseas utilizarla, elimínala en vez de reutilizarla.","images":"Imágenes","auto_close_label":"Cerrar automaticamente los temas después de:","auto_close_units":"horas","email_in":"Dirección de correo electrónico personalizada para el correo entrante:","email_in_allow_strangers":"Aceptar emails de usuarios anónimos sin cuenta","email_in_disabled":"La posibilidad de publicar nuevos temas por email está deshabilitada en los ajustes del sitio. Para habilitar la publicación de nuevos temas por email,","email_in_disabled_click":"activa la opción \"email in\".","contains_messages":"Cambiar esta categoría a sólo mensajes.","suppress_from_homepage":"Ocultar categoría de la página de inicio.","allow_badges_label":"Permitir conceder distintivos en esta categoría","edit_permissions":"Editar permisos","add_permission":"Añadir permisos","this_year":"este año","position":"posición","default_position":"Posición predeterminada","position_disabled":"Las Categorías se mostrarán por orden de actividad. Para controlar el orden en que aparecen en las listas,","position_disabled_click":"activa la opción \"fixed category positions\".","parent":"Categoría primaria","notifications":{"watching":{"title":"Vigilar","description":"Vigilarás automáticamente todos los nuevos temas en estas categorías. Serás notificado por cada nuevo mensaje en cada tema, y verás una cuenta de las nuevas respuestas."},"tracking":{"title":"Seguir","description":"Seguirás automáticamente todos los nuevos temas en estas categorías. Serás notificado si alguien menciona tu @nombre o te responde, y verás una cuenta de las nuevas respuestas."},"regular":{"title":"Normal","description":"Se te notificará solo si alguien menciona tu @nombre o te responde a un post."},"muted":{"title":"Silenciadas","description":"No serás notificado de ningún tema en estas categorías, y no aparecerán en la página de mensajes recientes."}}},"flagging":{"title":"¡Gracias por ayudar a mantener una comunidad civilizada!","private_reminder":"los reportes son privados, son visibles \u003cb\u003eúnicamente\u003c/b\u003e por los administradores","action":"Reportar post","take_action":"Tomar medidas","notify_action":"Mensaje","delete_spammer":"Borrar spammer","delete_confirm":"Estás a punto de eliminar \u003cb\u003e%{posts}\u003c/b\u003e publicaciones y \u003cb\u003e%{topics}\u003c/b\u003e temas de este usuario, borrar su cuenta, bloquear sus inicios de sesión desde su dirección IP \u003cb\u003e%{ip_address}\u003c/b\u003e, y añadir su dirección de email \u003cb\u003e%{email}\u003c/b\u003e a una lista de bloqueo permanente. ¿Estás seguro de que este usuario es realmente un spammer?","yes_delete_spammer":"Sí, borrar spammer","ip_address_missing":"(N/D)","hidden_email_address":"(oculto)","submit_tooltip":"Enviar el reporte privado","take_action_tooltip":"Alcanzar el umbral de reportes inmediatamente, en vez de esperar a más reportes de la comunidad","cant":"Lo sentimos, no puedes reportar este post en este momento.","notify_staff":"Notificar al Staff","formatted_name":{"off_topic":"Está fuera de lugar","inappropriate":"Es inapropiado","spam":"Es Spam"},"custom_placeholder_notify_user":"Sé específico, constructivo y siempre amable.","custom_placeholder_notify_moderators":"Haznos saber qué te preocupa específicamente y, siempre que sea posible, añade enlaces y ejemplos relevantes.","custom_message":{"at_least":"introduce al menos {{n}} caracteres","more":"{{n}} para ir...","left":"{{n}} restantes"}},"flagging_topic":{"title":"¡Gracias por ayudar a mantener una comunidad civilizada!","action":"Reportar tema","notify_action":"Mensaje"},"topic_map":{"title":"Resumen de temas","participants_title":"Autores frecuentes","links_title":"Enlaces populares","links_shown":"mostrar los {{totalLinks}} enlaces...","clicks":{"one":"1 clic","other":"%{count} clics"}},"topic_statuses":{"warning":{"help":"Ésta es una advertencia oficial."},"bookmarked":{"help":"Has guardado en marcadores este tema."},"locked":{"help":"este tema está cerrado; ya no aceptan nuevas respuestas"},"archived":{"help":"este tema está archivado; está congelado y no puede ser cambiado"},"locked_and_archived":{"help":"Este tema está cerrado y archivado; no acepta nuevas respuestas y no puede ser cambiado de ningún modo."},"unpinned":{"title":"Deseleccionado como destacado","help":"Este tema se ha dejado de destacar para ti; en tu listado de temas se mostrará en orden normal"},"pinned_globally":{"title":"Destacado globalmente","help":"Este tema ha sido destacado globalmente, se mostrará en la parte superior de la página de mensajes recientes y de su categoría."},"pinned":{"title":"Destacado","help":"Este tema ha sido destacado para ti; se mostrará en la parte superior de su categoría"},"invisible":{"help":"Este tema es invisible; no se mostrará en la lista de temas y solo puede acceder a él a través de su enlace directo."}},"posts":"Posts","posts_lowercase":"posts","posts_long":"{{number}} posts en este tema","original_post":"Post Original","views":"Visitas","views_lowercase":{"one":"visita","other":"visitas"},"replies":"Respuestas","views_long":"este tema se ha visto {{number}} veces","activity":"Actividad","likes":"Likes","likes_lowercase":{"one":"me gusta","other":"me gusta"},"likes_long":"este tema tiene {{number}} me gusta","users":"Usuarios","users_lowercase":{"one":"usuario","other":"usuarios"},"category_title":"Categoría","history":"Historia","changed_by":"por {{author}}","raw_email":{"title":"E-mail Original","not_available":"¡No disponible!"},"categories_list":"Lista de categorías","filters":{"with_topics":"%{filter} temas","with_category":"Foro de %{category} - %{filter}","latest":{"title":"Recientes","title_with_count":{"one":"Reciente (1)","other":"Recientes ({{count}})"},"help":"temas con posts recientes"},"hot":{"title":"Popular","help":"una selección de los temas más populares"},"read":{"title":"Leídos","help":"temas que ya has leído"},"search":{"title":"Buscar","help":"buscar todos los temas"},"categories":{"title":"Categorías","title_in":"Categoría - {{categoryName}}","help":"todos los temas agrupados por categoría"},"unread":{"title":"Sin leer","title_with_count":{"one":"Unread (1)","other":"No leídos ({{count}})"},"help":"temas que estás vigilando o siguiendo actualmente con posts no leídos","lower_title_with_count":{"one":"{{count}} sin leer","other":"{{count}} sin leer"}},"new":{"lower_title_with_count":{"one":"1 tema nuevo","other":"{{count}} temas nuevos"},"lower_title":"nuevo","title":"Nuevo","title_with_count":{"one":"Nuevos ({{count}})","other":"Nuevos ({{count}})"},"help":"temas publicados en los últimos días"},"posted":{"title":"Mis posts","help":"temas en los que has publicado"},"bookmarks":{"title":"Marcadores","help":"temas que has guardado en marcadores"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"},"help":"temas recientes en la categoría {{categoryName}}"},"top":{"title":"Top","help":"los temas más con más actividad del último año, mes, semana, o día","all":{"title":"Siempre"},"yearly":{"title":"Año"},"quarterly":{"title":"Trimestral"},"monthly":{"title":"Mes"},"weekly":{"title":"Semana"},"daily":{"title":"Día"},"all_time":"Siempre","this_year":"Año","this_quarter":"Trimestre","this_month":"Mes","this_week":"Semana","today":"Hoy","other_periods":"ver temas top"}},"browser_update":"Desafortunadamente, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003etu navegador es demasiado antiguo para funcionar en este sitio\u003c/a\u003e. Por favor \u003ca href=\"http://browsehappy.com\"\u003eactualízalo\u003c/a\u003e.","permission_types":{"full":"Crear / Responder / Ver","create_post":"Responder / Ver","readonly":"Ver"},"docker":{"upgrade":"Las actualizaciones son realizadas por Docker.","perform_upgrade":"Clic aquí para actualizar."},"poll":{"voters":{"one":"votante","other":"votantes"},"total_votes":{"one":"voto total","other":"votos totales"},"average_rating":"Puntuación media: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"Debes elegir al menos \u003cstrong\u003e1\u003c/strong\u003e opción.","other":"Debes elegir al menos \u003cstrong\u003e%{count}\u003c/strong\u003e opciones."},"up_to_max_options":{"one":"Puedes elegir hasta \u003cstrong\u003e1\u003c/strong\u003e opción.","other":"Puedes elegir hasta \u003cstrong\u003e%{count}\u003c/strong\u003e opciones."},"x_options":{"one":"Debes elegir \u003cstrong\u003e1\u003c/strong\u003e opción.","other":"Debes elegir \u003cstrong\u003e%{count}\u003c/strong\u003e opciones."},"between_min_and_max_options":"Puedes escoger entre \u003cstrong\u003e%{min}\u003c/strong\u003e y \u003cstrong\u003e%{max}\u003c/strong\u003e opciones."}},"cast-votes":{"title":"Votar","label":"¡Vota!"},"show-results":{"title":"Mostrar los resultados de la encuesta","label":"Mostrar resultados"},"hide-results":{"title":"Volver a los votos","label":"Ocultar resultados"},"open":{"title":"Abrir encuesta","label":"Abrir","confirm":"¿Seguro que quieres abrir esta encuesta?"},"close":{"title":"Cerrar la encuesta","label":"Cerrar","confirm":"¿Seguro que quieres cerrar esta encuesta?"},"error_while_toggling_status":"Ha ocurrido un error mientras se cambiaba el estado de esta encuesta.","error_while_casting_votes":"Ha ocurrido un error a la hora de enviar los votos."},"type_to_filter":"filtrar opciones...","admin":{"title":"Administrador de Discourse","moderator":"Moderador","dashboard":{"title":"Panel","last_updated":"Panel actualizado el:","version":"Versión","up_to_date":"¡Estás al día!","critical_available":"Actualización crítica disponible.","updates_available":"Hay actualizaciones disponibles.","please_upgrade":"¡Por favor, actualiza!","no_check_performed":"Una revisión de actualizaciones no ha sido realizada aún. Asegúrate de que sidekiq está funcionando.","stale_data":"Una revisión de actualizaciones no ha sido realizada recientemente. Asegúrate de que sidekiq está funcionando.","version_check_pending":"Parece que has actualizado recientemente. Fantástico!","installed_version":"Instalada","latest_version":"Última","problems_found":"Hemos encontrado algunos problemas con tu instalación de Discourse","last_checked":"Ultima comprobación","refresh_problems":"Refrescar","no_problems":"Ningún problema ha sido encontrado.","moderators":"Moderadores:","admins":"Administradores:","blocked":"Bloqueados:","suspended":"Suspendidos:","private_messages_short":"Mensajes privados","private_messages_title":"Mensajes","mobile_title":"Móvil","space_free":"{{size}} libre","uploads":"subidas","backups":"backups","traffic_short":"Tráfico","traffic":"Peticiones web de la app","page_views":"Peticiones de API","page_views_short":"Peticiones de API","show_traffic_report":"Mostrar informe detallado del tráfico","reports":{"today":"Hoy","yesterday":"Ayer","last_7_days":"Últimos 7 días","last_30_days":"Últimos 30 días","all_time":"Todo el tiempo","7_days_ago":"Hace 7 días","30_days_ago":"Hace 30 días","all":"Todo","view_table":"tabla","view_chart":"gráfico de barras","refresh_report":"Actualizar reporte","start_date":"Desde fecha","end_date":"Hasta fecha"}},"commits":{"latest_changes":"Cambios recientes: ¡actualiza a menudo!","by":"por"},"flags":{"title":"Reportes","old":"Antiguo","active":"Activo","agree":"De acuerdo","agree_title":"Confirmar esta indicación como válido y correcto.","agree_flag_modal_title":"Estar de acuerdo y...","agree_flag_hide_post":"Coincido (ocultar post + enviar MP)","agree_flag_hide_post_title":"Ocultar este post y enviar automáticamente un mensaje al usuario para que lo edite de forma urgente","agree_flag_restore_post":"De acuerdo (restaurar post)","agree_flag_restore_post_title":"Restaurar este post","agree_flag":"Estar de acuerdo con la indicación","agree_flag_title":"Estar de acuerdo con la indicación y mantener la publicación intacta","defer_flag":"Aplazar","defer_flag_title":"Eliminar este indicador; no es necesaria ninguna acción en este momento.","delete":"Eliminar","delete_title":"Eliminar el post referido por este indicador.","delete_post_defer_flag":"Eliminar post y aplazar reporte","delete_post_defer_flag_title":"Eliminar post; si era el primero de un tema, eliminar el tema","delete_post_agree_flag":"Eliminar post y estar de acuerdo con la indicación","delete_post_agree_flag_title":"Eliminar post; si era el primero de un tema, eliminar el tema","delete_flag_modal_title":"Borrar y...","delete_spammer":"Eliminar spammer","delete_spammer_title":"Eliminar usuario y todos los posts y temas de ese usuario.","disagree_flag_unhide_post":"No coincido (volver a mostrar post)","disagree_flag_unhide_post_title":"Quitar todos los reportes de este post y hacerlo visible de nuevo","disagree_flag":"No coincido","disagree_flag_title":"Denegar esta indicación como inválida o incorrecta","clear_topic_flags":"Hecho","clear_topic_flags_title":"Este tema ha sido investigado y los problemas han sido resueltos. Haz clic en Hecho para eliminar los reportes.","more":"(más respuestas...)","dispositions":{"agreed":"coincidió","disagreed":"no coincidió","deferred":"aplazado"},"flagged_by":"Reportado por","resolved_by":"Resuelto por","took_action":"Tomó medidas","system":"Sistema","error":"Algo salió mal","reply_message":"Responder","no_results":"No hay reportes.","topic_flagged":"Este \u003cstrong\u003etema\u003c/strong\u003e ha sido reportado.","visit_topic":"Visita el tema para tomar medidas","was_edited":"El post fue editado después del primer reporte","previous_flags_count":"Este post ya fue marcado {{count}} veces.","summary":{"action_type_3":{"one":"fuera de tema","other":"fuera de tema x{{count}}"},"action_type_4":{"one":"inapropiado","other":"inapropiado x{{count}}"},"action_type_6":{"one":"personalizado","other":"personalizado x{{count}}"},"action_type_7":{"one":"personalizado","other":"personalizado x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Grupo principal","no_primary":"(ningún grupo principal)","title":"Grupos","edit":"Editar grupos","refresh":"Actualizar","new":"Nuevo","selector_placeholder":"introduce nombre de usuario","name_placeholder":"Nombre del grupo, sin espacios, al igual que la regla del nombre usuario","about":"Edita los aquí los nombres de los grupos y sus miembros","group_members":"Miembros del grupo","delete":"Borrar","delete_confirm":"Borrar este grupo?","delete_failed":"No se pudo borrar el grupo. Si este es un grupo automático, no se puede destruir.","delete_member_confirm":"¿Eliminar a '%{username}' del grupo '%{group}'?","delete_owner_confirm":"¿Quitar privilegios de propietario para '%{username}'?","name":"Nombre","add":"Añadir","add_members":"Añadir miembros","custom":"Personalizado","bulk_complete":"Los usuarios han sido añadidos al grupo.","bulk":"Añadir al grupo en masa","bulk_paste":"Pega una lista de nombres de usuario o emails, uno por línea:","bulk_select":"(selecciona un grupo)","automatic":"Automático","automatic_membership_email_domains":"Los usuarios que se registren con un dominio de e-mail que esté en esta lista serán automáticamente añadidos a este grupo:","automatic_membership_retroactive":"Aplicar la misma regla de dominio de email para usuarios registrados existentes ","default_title":"Título por defecto para todos los miembros en este grupo","primary_group":"Establecer como grupo primario automáticamente","group_owners":"Propietarios","add_owners":"Añadir propietarios"},"api":{"generate_master":"Generar clave maestra de API","none":"No hay ninguna clave de API activa en este momento.","user":"Usuario","title":"API","key":"Clave de API","generate":"Generar clave de API","regenerate":"Regenerar clave de API","revoke":"Revocar","confirm_regen":"Estás seguro que quieres reemplazar esa Clave de API con una nueva?","confirm_revoke":"Estás seguro que quieres revocar esa clave?","info_html":"Tu clave de API te permitirá crear y actualizar temas usando llamadas a JSON.","all_users":"Todos los usuarios","note_html":"Mantén esta clave \u003cstrong\u003esecreta\u003c/strong\u003e a buen recaudo, cualquier usuario que disponga de ella podría crear posts de cualquier usuario."},"plugins":{"title":"Plugins","installed":"Plugins instalados","name":"Nombre","none_installed":"No tienes plugins instalados.","version":"Versión","enabled":"¿Activado?","is_enabled":"S","not_enabled":"N","change_settings":"Cambiar preferencias","change_settings_short":"Ajustes","howto":"¿Cómo instalo plugins?"},"backups":{"title":"Copia de seguridad","menu":{"backups":"Copia de seguridad","logs":"Logs"},"none":"Ninguna copia disponible.","read_only":{"enable":{"title":"Habilitar el modo de 'solo-lectura'","label":"Activar el modo solo-lectura","confirm":"¿Estás seguro que quieres habilitar el modo de \"solo lectura\"?"},"disable":{"title":"Deshabilitar el modo de \"solo lectura\"","label":"Desactivar el modo solo-lectura"}},"logs":{"none":"No hay información de momento..."},"columns":{"filename":"Nombre del archivo","size":"Tamaño"},"upload":{"label":"Subir","title":"Subir un backup a esta instancia","uploading":"Subiendo...","success":"El archivo '{{filename}}' se ha subido correctamente.","error":"Ha ocurrido un error al subir el archivo '{{filename}}': {{message}}"},"operations":{"is_running":"Actualmente una operación se está procesando...","failed":"La {{operation}} falló. Por favor revisa los logs","cancel":{"label":"Cancelar","title":"Cancelar la operación actual","confirm":"¿Estás seguro que quieres cancelar la operación actual?"},"backup":{"label":"Backup","title":"Crear una copia de seguridad","confirm":"¿Quieres iniciar una nueva copia de seguridad?","without_uploads":"Sí (no incluir archivos)"},"download":{"label":"Descargar","title":"Descargar la copia de seguridad"},"destroy":{"title":"Borrar la copia de seguridad","confirm":"¿Estás seguro que quieres borrar esta copia de seguridad?"},"restore":{"is_disabled":"Restaurar está deshabilitado en la configuración del sitio.","label":"Restaurar","title":"Restaurar la copia de seguridad","confirm":"¿Estás seguro que quieres restaurar esta copia de seguridad?"},"rollback":{"label":"Revertir","title":"Regresar la base de datos al estado funcional anterior","confirm":"¿Estás seguro que quieres regresar la base de datos al estado funcional anterior?"}}},"export_csv":{"user_archive_confirm":"¿Seguro que quieres descargar todos tus posts?","success":"Exportación iniciada, se te notificará a través de un mensaje cuando el proceso se haya completado.","failed":"Exportación fallida, revisa los logs.","rate_limit_error":"Los posts se pueden descargar una vez al día, por favor, prueba otra vez mañana.","button_text":"Exportar","button_title":{"user":"Exportar la lista completa de usuarios en formato CSV.","staff_action":"Exportar el registro completo de acciones de administradores en formato CSV.","screened_email":"Exportar la lista completa de emails vistos en formato CSV.","screened_ip":"Exportar la lista completa de IP vistas en formato CSV.","screened_url":"Exportar la lista completa de URL vistas en formato CSV."}},"export_json":{"button_text":"Exportar"},"invite":{"button_text":"Enviar invitaciones","button_title":"Enviar invitaciones"},"customize":{"title":"Personalizar","long_title":"Personalizaciones del sitio","css":"CSS","header":"Encabezado","top":"Top","footer":"Pie de página","embedded_css":"CSS embebido","head_tag":{"text":"\u003c/head\u003e","title":"HTML insertado antes de la etiqueta \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML insertado antes de la etiqueta \u003c/body\u003e"},"override_default":"No incluir hoja de estilo estándar","enabled":"¿Activado?","preview":"vista previa","undo_preview":"eliminar vista previa","rescue_preview":"estilo por defecto","explain_preview":"Ver el sitio con esta hoja de estilo","explain_undo_preview":"Volver a la hoja de estilo personalizada activada actualmente","explain_rescue_preview":"Ver el sitio con la hoja de estilo por defecto","save":"Guardar","new":"Nuevo","new_style":"Nuevo Estilo","import":"Importar","import_title":"Selecciona un archivo o pega texto","delete":"Eliminar","delete_confirm":"¿Eliminar esta personalización?","about":"Modifica hojas de estilo CSS y cabeceras HTML en el sitio. Añade una personalización para empezar.","color":"Color","opacity":"Opacidad","copy":"Copiar","email_templates":{"title":"Diseño del email","subject":"Título del email","body":"Cuerpo del email","none_selected":"Selecciona un 'diseño de email' para comenzar a editar","revert":"Revertir los cambios","revert_confirm":"¿Estás seguro de querer revertir los cambios?"},"css_html":{"title":"CSS/HTML","long_title":"Personalizaciones CSS y HTML"},"colors":{"title":"Colores","long_title":"Esquemas de color","about":"Modifica los colores utilizados en el sitio sin editar el CSS. Añade un esquema de color para empezar.","new_name":"Nuevo esquema de color","copy_name_prefix":"Copia de","delete_confirm":"¿Eliminar este esquema de color?","undo":"deshacer","undo_title":"Deshacer los cambios a este color hasta el último guardado.","revert":"rehacer","revert_title":"Restaurar este color al esquema de Discourse por defecto.","primary":{"name":"primario","description":"La mayoría del texto, iconos y bordes."},"secondary":{"name":"secundario","description":"El color de fondo principal y el color de texto de algunos botones."},"tertiary":{"name":"terciario","description":"Enlaces, algunos botones, notificaciones y color de énfasis."},"quaternary":{"name":"cuaternario","description":"Enlaces de navegación."},"header_background":{"name":"fondo del encabezado","description":"Color de fondo del encabezado del sitio."},"header_primary":{"name":"encabezado primario","description":"Texto e iconos en el encabezado del sitio."},"highlight":{"name":"resaltado","description":"El color de fondo de los elementos resaltados en la página, como temas o posts."},"danger":{"name":"peligro","description":"Color del resaltado para acciones como eliminar temas o posts."},"success":{"name":"éxito","description":"Para indicar que una acción se realizó correctamente."},"love":{"name":"me gusta","description":"El color del botón de \"me gusta\""},"wiki":{"name":"wiki","description":"Color base usado para el fondo en los posts del wiki."}}},"email":{"title":"Email","settings":"Ajustes","all":"Todos","sending_test":"Enviando e-mail de prueba...","error":"\u003cb\u003eERROR\u003c/b\u003e - %{server_error}","test_error":"Hubo un error al enviar el email de prueba. Por favor, revisa la configuración de correo, verifica que tu servicio de alojamiento no esté bloqueando los puertos de conexión de correo, y prueba de nuevo.","sent":"Enviado","skipped":"Omitidos","sent_at":"Enviado a","time":"Fecha","user":"Usuario","email_type":"Email","to_address":"A dirección","test_email_address":"dirección de email de prueba","send_test":"Enviar email de prueba","sent_test":"enviado!","delivery_method":"Método de entrega","preview_digest":"Vista previa de Resumen","preview_digest_desc":"Previsualiza el contenido del email de resumen enviado a usuarios inactivos.","refresh":"Actualizar","format":"Formato","html":"html","text":"texto","last_seen_user":"Último usuario visto:","reply_key":"Clave de respuesta","skipped_reason":"Saltar motivo","logs":{"none":"No se han encontrado registros.","filters":{"title":"filtro","user_placeholder":"nombre de usuario","address_placeholder":"nombre@ejemplo.com","type_placeholder":"resumen, registro...","reply_key_placeholder":"clave de respuesta","skipped_reason_placeholder":"motivo"}}},"logs":{"title":"Logs","action":"Acción","created_at":"Creado","last_match_at":"Última coincidencia","match_count":"Coincidencias","ip_address":"IP","topic_id":"ID del Tema","post_id":"ID del Post","category_id":"ID de la categoría","delete":"Eliminar","edit":"Editar","save":"Guardar","screened_actions":{"block":"bloquear","do_nothing":"no hacer nada"},"staff_actions":{"title":"Acciones del staff","instructions":"Clic en los usuarios y acciones para filtrar la lista. Clic en las imágenes de perfil para ir a páginas de usuario.","clear_filters":"Mostrar todo","staff_user":"Usuario administrador","target_user":"Usuario enfocado","subject":"Sujeto","when":"Cuándo","context":"Contexto","details":"Detalles","previous_value":"Anterior","new_value":"Nuevo","diff":"Diff","show":"Mostrar","modal_title":"Detalles","no_previous":"No existe un valor anterior.","deleted":"No hay un valor nuevo. El registro ha sido borrado.","actions":{"delete_user":"Borrar usuario","change_trust_level":"cambiar nivel de confianza","change_username":"cambiar nombre de usuario","change_site_setting":"cambiar configuración del sitio","change_site_customization":"cambiar customización del sitio","delete_site_customization":"borrar customización del sitio","suspend_user":"suspender usuario","unsuspend_user":"desbloquear usuario","grant_badge":"conceder distintivo","revoke_badge":"revocar distintivo","check_email":"comprobar e-mail","delete_topic":"eliminar tema","delete_post":"eliminar post","impersonate":"impersonar","anonymize_user":"anonimizar usuario","roll_up":"agrupar bloqueos de IP","change_category_settings":"cambiar opciones de categoría","delete_category":"eliminar categoría","create_category":"crear categoría"}},"screened_emails":{"title":"Correos bloqueados","description":"Cuando alguien trata de crear una cuenta nueva, los siguientes correos serán revisados y el registro será bloqueado, o alguna otra acción será realizada.","email":"Correo electrónico","actions":{"allow":"Permitir"}},"screened_urls":{"title":"URLs bloqueadas","description":"Las URLs listadas aquí fueron utilizadas en posts de usuarios identificados como spammers.","url":"URL","domain":"Dominio"},"screened_ips":{"title":"IPs bloqueadas","description":"Direcciones IP que están siendo vigiladas. Usa \"Permitir\" para añadir direcciones IP preaprobadas.","delete_confirm":"Estás seguro que quieres remover el bloqueo para %{ip_address}?","roll_up_confirm":"¿Estás seguro de que quieres agrupar las IPs vistas con frecuencia en subredes?","rolled_up_some_subnets":"Se han agrupado con éxito las entradas de IP baneadas a estos rangos: %{subnets}.","rolled_up_no_subnet":"No había nada para agrupar.","actions":{"block":"Bloquear","do_nothing":"Permitir","allow_admin":"Permitir administrador"},"form":{"label":"Nueva:","ip_address":"Dirección IP","add":"Añadir","filter":"Búsqueda"},"roll_up":{"text":"Agrupar","title":"Crea un nuevo rango de entradas para banear si hay al menos 'min_ban_entries_for_roll_up' entradas."}},"logster":{"title":"Registros de errores"}},"impersonate":{"title":"Impersonar","help":"Utiliza esta herramienta para personificar una cuenta de usuario con fines de depuración. Tendrás que cerrar sesión al terminar.","not_found":"No se pudo encontrar a ese usuario.","invalid":"Lo sentimos, no puedes impersonarte en ese usuario."},"users":{"title":"Usuarios","create":"Añadir Usuario Administrador","last_emailed":"Último email enviado","not_found":"Lo sentimos, ese usuario no existe.","id_not_found":"Lo sentimos, esa id de usuario no existe en nuestro sistema.","active":"Activo","show_emails":"Mostrar emails","nav":{"new":"Nuevo","active":"Activo","pending":"Pendiente","staff":"Staff","suspended":"Suspendidos","blocked":"Bloqueados","suspect":"Sospechoso"},"approved":"Aprobado/s?","approved_selected":{"one":"aprobar usuario","other":"aprobar ({{count}}) usuarios"},"reject_selected":{"one":"rechazar usuario","other":"rechazar ({{count}}) usuarios"},"titles":{"active":"Usuarios activos","new":"Usuarios nuevos","pending":"Usuarios pendientes de revisión","newuser":"Usuarios con nivel de confianza 0 (Nuevo)","basic":"Usuarios con nivel de confianza 1 (Básico)","member":"Usuarios en nivel de confianza 2 (Miembro)","regular":"Usuarios en nivel de confianza 3 (Habitual)","leader":"Usuarios en nivel de confianza 4 (Líder)","staff":"Staff","admins":"Administradores","moderators":"Moderadores","blocked":"Usuarios bloqueados","suspended":"Usuarios suspendidos","suspect":"Usuarios sospechados"},"reject_successful":{"one":"1 usuario rechazado con éxito.","other":"%{count} usuarios rechazados con éxito."},"reject_failures":{"one":"Error al rechazar 1 usuario.","other":"Error al rechazar %{count} usuarios."},"not_verified":"No verificado","check_email":{"title":"Revelar la dirección de e-mail de este usuario","text":"Mostrar"}},"user":{"suspend_failed":"Algo salió mal baneando este usuario {{error}}","unsuspend_failed":"Algo salió mal quitando ban a este usuario {{error}}","suspend_duration":"¿Cuánto tiempo le gustaría aplicar ban al usuario? (days)","suspend_duration_units":"(días)","suspend_reason_label":"¿Por qué lo suspendes? Este texto \u003cb\u003eserá visible para todos\u003c/b\u003e en la página de perfil del usuario y se mostrará al usuario cuando intente iniciar sesión. Sé conciso.","suspend_reason":"Causa","suspended_by":"Suspendido por","delete_all_posts":"Eliminar todos los posts","delete_all_posts_confirm":"Estás a punto de borrar %{posts} posts y %{topics} temas. ¿Estás seguro?","suspend":"Suspender","unsuspend":"Quitar suspensión","suspended":"¿Suspendido?","moderator":"¿Moderador?","admin":"¿Administrador?","blocked":"¿Bloqueado?","show_admin_profile":"Administrador","edit_title":"Editar título","save_title":"Guardar título","refresh_browsers":"Forzar recarga del navegador","refresh_browsers_message":"¡Mensaje enviado a todos los clientes!","show_public_profile":"Ver perfil público","impersonate":"Impersonar a","ip_lookup":"Búsqueda de IP","log_out":"Cerrar sesión","logged_out":"El usuario ha cerrado sesión desde todos los dispositivos","revoke_admin":"Revocar administrador","grant_admin":"Conceder administración","revoke_moderation":"Revocar moderación","grant_moderation":"Conceder moderación","unblock":"Desbloquear","block":"Bloquear","reputation":"Reputación","permissions":"Permisos","activity":"Actividad","like_count":"Likes Dados / Recibidos","last_100_days":"en los últimos 100 días","private_topics_count":"Temas privados","posts_read_count":"Posts leídos","post_count":"Posts publicados","topics_entered":"Temas vistos","flags_given_count":"Reportes enviados","flags_received_count":"Reportes recibidos","warnings_received_count":"Advertencias recibidas","flags_given_received_count":"Reportes Enviados / Recibidos","approve":"Aprobar","approved_by":"aprobado por","approve_success":"Usuario aprobado y correo electrónico enviado con instrucciones para la activación.","approve_bulk_success":"¡Perfecto! Todos los usuarios seleccionados han sido aprobados y notificados.","time_read":"Tiempo de lectura","anonymize":"Anonimizar usuario","anonymize_confirm":"¿SEGURO que quieres hacer anónima esta cuenta? Esto cambiará el nombre de usuario y el email, y reseteará toda la información de perfil.","anonymize_yes":"Sí, hacer anónima esta cuenta.","anonymize_failed":"Hubo un problema al hacer anónima la cuenta.","delete":"Borrar usuario","delete_forbidden_because_staff":"Administradores y moderadores no pueden ser eliminados","delete_posts_forbidden_because_staff":"No se pueden eliminar todos los posts de admins y moderadores.","delete_forbidden":{"one":"Los usuarios no se pueden borrar si han sido registrados hace más de %{count} día, o si tienen publicaciones. Borra todas publicaciones antes de tratar de borrar un usuario.","other":"Los usuarios no se pueden borrar si han sido registrados hace más de %{count} días, o si tienen publicaciones. Borra todas publicaciones antes de tratar de borrar un usuario."},"cant_delete_all_posts":{"one":"No se pueden eliminar todos los posts. Algunos tienen más de %{count} día de antigüedad. (Ver la opción delete_user_max_post_age )","other":"No se pueden eliminar todos los posts. Algunos tienen más de %{count} días de antigüedad. (Ver la opción delete_user_max_post_age )"},"cant_delete_all_too_many_posts":{"one":"No se pueden eliminar todos los posts porque el usuario tiene más de 1 post. (Ver la opción delete_all_posts_max)","other":"No se pueden eliminar todos los posts porque el usuario tiene más de %{count} posts. (Ver la opción delete_all_posts_max)"},"delete_confirm":"Estás SEGURO que quieres borrar este usuario? Esta acción es permanente!","delete_and_block":"Eliminar y \u003cb\u003ebloquear\u003c/b\u003e este correo y esta dirección IP","delete_dont_block":"Eliminar solo.","deleted":"El usuario fue borrado.","delete_failed":"Ha habido un error al borrar ese usuario. Asegúrate que todos las publicaciones han sido borrados antes de tratando de borrar este usuario.","send_activation_email":"Enviar correo de activación","activation_email_sent":"Un correo de activación ha sido enviado.","send_activation_email_failed":"Ha habido un problema enviando otro correo de activación. %{error}","activate":"Activar Cuenta","activate_failed":"Ha habido un problem activando el usuario.","deactivate_account":"Desactivar cuenta","deactivate_failed":"Ha habido un problema desactivando el usuario.","unblock_failed":"Ha habido un problema desbloqueando el usuario.","block_failed":"Ha habido un problema bloqueando el usuario.","deactivate_explanation":"Un usuario desactivado debe rehabilitar su dirección de correo.","suspended_explanation":"Un usuario suspendido no puede ingresar al sitio.","block_explanation":"Un usuario bloqueado no puede publicar posts ni crear temas.","trust_level_change_failed":"Ha habido un problema cambiando el nivel de confianza del usuario.","suspend_modal_title":"Suspender Usuario","trust_level_2_users":"Usuarios del nivel de Confianza 2","trust_level_3_requirements":"Requerimientos para nivel de confianza 3","trust_level_locked_tip":"El nivel de confianza esta bloqueado, el sistema no promoverá o degradara al usuario.","trust_level_unlocked_tip":"El nivel de confianza esta desbloqueado, el sistema podrá promover o degradar al usuario.","lock_trust_level":"Bloquear Nivel de Confianza","unlock_trust_level":"Desbloquear Nivel de Confianza","tl3_requirements":{"title":"Requerimientos para el nivel de confianza 3","table_title":"En los últimos 100 días:","value_heading":"Valor","requirement_heading":"Requerimiento","visits":"Visitas","days":"días","topics_replied_to":"Temas en los que ha comentado","topics_viewed":"Temas vistos","topics_viewed_all_time":"Temas vistos (desde siempre)","posts_read":"Posts leídos","posts_read_all_time":"Posts leídos (desde siempre)","flagged_posts":"Posts reportados","flagged_by_users":"Usuarios que lo reportaron","likes_given":"Likes dados","likes_received":"Likes recibidos","likes_received_days":"'Me gusta' Recibidos: días únicos","likes_received_users":"'Me gusta' Recibidos: usuarios únicos.","qualifies":"Califica para el nivel de confianza 3.","does_not_qualify":"No califica para el nivel de confianza 3.","will_be_promoted":"Será promovido pronto.","will_be_demoted":"Será degradado pronto.","on_grace_period":"Actualmente en periodo de gracia de promoción, no será degradado.","locked_will_not_be_promoted":"Nivel de confianza bloqueado. Nunca será promovido.","locked_will_not_be_demoted":"Nivel de confianza bloqueado. Nunca será degradado."},"sso":{"title":"Single Sign On","external_id":"ID externa","external_username":"Nombre de usuario","external_name":"Nombre","external_email":"Email","external_avatar_url":"URL de imagen de perfil"}},"user_fields":{"title":"Campos de Usuario","help":"Añadir campos que tus usuarios pueden llenar.","create":"Crear Campo de Usuario","untitled":"Sin título","name":"Nombre del Campo","type":"Tipo de Campo","description":"Descripción del Campo","save":"Guardar","edit":"Editar","delete":"Borrar","cancel":"Cancelar","delete_confirm":"Esta seguro que quiere borrar ese campo de usuario?","options":"Opciones","required":{"title":"¿Requerido al registrarse?","enabled":"requerido","disabled":"no requerido"},"editable":{"title":"¿Editable después del registro?","enabled":"editable","disabled":"no editable"},"show_on_profile":{"title":"¿Se muestra públicamente en el perfil?","enabled":"Mostrado en el perfil","disabled":"No mostrado en el perfil"},"field_types":{"text":"Campo de Texto","confirm":"Confirmación","dropdown":"Lista"}},"site_text":{"none":"Elige un tipo de contenido para empezar a editar.","title":"Contenido de Texto"},"site_settings":{"show_overriden":"Sólo mostrar lo personalizado","title":"Ajustes del sitio","reset":"restablecer","none":"ninguno","no_results":"Ningún resultado encontrado","clear_filter":"Limpiar filtro","add_url":"añadir URL","add_host":"añadir host","categories":{"all_results":"Todo","required":"Requerido","basic":"Ajustes básicos","users":"Usuarios","posting":"Publicar","email":"Email","files":"Archivos","trust":"Niveles de confianza","security":"Seguridad","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Límites de velocidad","developer":"Desarrollador","embedding":"Embebido","legal":"Legal","uncategorized":"Otros","backups":"Copias de seguridad","login":"Login","plugins":"Plugins","user_preferences":"Preferencias de los Usuarios"}},"badges":{"title":"Distintivos","new_badge":"Nuevo distintivo","new":"Nuevo","name":"Nombre","badge":"Distintivo","display_name":"Nombre a mostrar","description":"Descripción","badge_type":"Tipo de distintivo","badge_grouping":"Grupo","badge_groupings":{"modal_title":"Grupos de distintivos"},"granted_by":"Concedido por","granted_at":"Concedido en","reason_help":"(Enlace a un post o tema)","save":"Guardar","delete":"Borrar","delete_confirm":"¿Estás seguro de que quieres eliminar este distintivo?","revoke":"Revocar","reason":"Motivo","expand":"Expandir \u0026hellip;","revoke_confirm":"¿Estás seguro de que quieres revocar este distintivo?","edit_badges":"Editar distintivos","grant_badge":"Condecer distintivo","granted_badges":"Distintivos concedidos","grant":"Conceder","no_user_badges":"%{name} no tiene ningún distintivo.","no_badges":"No hay distintivos para conceder.","none_selected":"Selecciona un distintivo para empezar","allow_title":"Permitir usar distintivo como título","multiple_grant":"Puede ser concedido varias veces","listable":"Mostrar distintivo en la página pública de distintivos","enabled":"Activar distintivo","icon":"Icono","image":"Imagen","icon_help":"Usa ya sea una clase Font Awesome o una URL a la imagen","query":"Consulta (SQL) para otorgar el distintivo","target_posts":"La consulta tiene como objetivo posts","auto_revoke":"Ejecutar diariamente la consulta de revocación","show_posts":"Mostrar el post por el que se concedió el distintivo en la página de distintivos","trigger":"Activador","trigger_type":{"none":"Actualizar diariamente","post_action":"Cuando un usuario interactúa con un post","post_revision":"Cuando un usuario edita o crea un post","trust_level_change":"Cuando cambia el nivel de confianza de un usuario","user_change":"Cuando se edita o se crea un usuario"},"preview":{"link_text":"Vista previa de los distintivos concedidos","plan_text":"Vista previa con el planteamiento de tu query","modal_title":"Vista previa de la query para el distintivo","sql_error_header":"Ha ocurrido un error con la consulta.","error_help":"Mira los siguientes enlaces para ayudarte con las queries de los distintivos.","bad_count_warning":{"header":"¡ADVERTENCIA!","text":"Faltan algunas muestras a la hora de conceder el distintivo. Esto ocurre cuando la query del distintivo devuelve IDs de usuarios o de posts que no existen. Esto podría causar resultados inesperados más tarde - por favor, revisa de nuevo tu query."},"no_grant_count":"No hay distintivos para asignar.","grant_count":{"one":"\u003cb\u003e%{count}\u003c/b\u003e distintivos para conceder.","other":"\u003cb\u003e%{count}\u003c/b\u003e distintivos para conceder."},"sample":"Ejemplo:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e por publicar en %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e por publicar en %{link} el \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e el \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Añade nuevos emojis que estarán disponibles para todos. (CONSEJO: arrasta varios archivos a la vez)","add":"Añadir nuevo Emoji","name":"Nombre","image":"Imagen","delete_confirm":"¿Estás seguro de querer eliminar el emoji :%{name}:?"},"embedding":{"get_started":"Si quieres insertar Discourse en otro sitio web, empieza por añadir su host.","confirm_delete":"¿Seguro que quieres borrar ese host?","sample":"Usa el siguiente código HTML en tu sitio para crear e insertar temas. Reempalza \u003cb\u003eREPLACE_ME\u003c/b\u003e con la URL canónica de la página donde quieres insertar.","title":"Insertado","host":"Hosts Permitidos","edit":"editar","category":"Publicar a Categoría","add_host":"Añadir Host","settings":"Ajustes de Insertado","feed_settings":"Ajustes de Feed","feed_description":"Discourse podrá importar tu contenido de forma más fácil si proporcionas un feed RSS/ATOM de tu sitio.","crawling_settings":"Ajustes de Crawlers","crawling_description":"Cuando Discourse crea temas para tus posts, si no hay un feed RSS/ATOM presente intentará analizar el contenido de tu HTML. A veces puede ser difícil extraer tu contenido, por eso facilitamos la opción de especificar reglas CSS para hacer la extracción más fácil.","embed_by_username":"Usuario para la creación de temas","embed_post_limit":"Máximo número de posts a incluir","embed_username_key_from_feed":"Clave para extraer usuario de discourse del feed","embed_truncate":"Truncar los posts insertados","embed_whitelist_selector":"Selector CSS para permitir elementos a embeber","embed_blacklist_selector":"Selector CSS para restringir elementos a embeber","feed_polling_enabled":"Importar posts usando RSS/ATOM","feed_polling_url":"URL del feed RSS/ATOM del que extraer datos","save":"Guardar ajustes de Insertado"},"permalink":{"title":"Enlaces permanentes","url":"URL","topic_id":"ID del tema","topic_title":"Tema","post_id":"ID del post","post_title":"Post","category_id":"Id de la categoría","category_title":"Categoría","external_url":"URL externa","delete_confirm":"¿Seguro que quieres eliminar este enlace permanente?","form":{"label":"Nuevo:","add":"Añadir","filter":"Buscar (URL o URL externa)"}}},"lightbox":{"download":"descargar"},"search_help":{"title":"Ayuda para búsquedas"},"keyboard_shortcuts_help":{"title":"Atajos de teclado","jump_to":{"title":"Saltar a","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Inicio","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Recientes","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nuevos","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e No leídos","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Categorías","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Arriba","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Marcadores","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Perfil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mensajes"},"navigation":{"title":"Navegación","jump":"\u003cb\u003e#\u003c/b\u003e Ir al post #","back":"\u003cb\u003eu\u003c/b\u003e Atrás","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Desplazar selección \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEntrar\u003c/b\u003e Abrir tema seleccionado","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Siguiente/anterior sección"},"application":{"title":"Aplicación","create":"\u003cb\u003ec\u003c/b\u003e Crear un tema nuevo","notifications":"\u003cb\u003en\u003c/b\u003e Abrir notificaciones","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Abrir Menú","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Abrir menú de usuario","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Mostrar temas actualizados","search":"\u003cb\u003e/\u003c/b\u003e Buscar","help":"\u003cb\u003e?\u003c/b\u003e Abrir la guía de atajos de teclado","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Descartar Nuevo/Posts","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Descartar Temas","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Cerrar sesión"},"actions":{"title":"Acciones","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Guardar/Quitar el tema de marcadores","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Seleccionar/Deseleccionar como destacado","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Compartir tema","share_post":"\u003cb\u003es\u003c/b\u003e Compartir post","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Responder como un tema enlazado.","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Responder al tema","reply_post":"\u003cb\u003er\u003c/b\u003e Responder al post","quote_post":"\u003cb\u003eq\u003c/b\u003e Citar post","like":"\u003cb\u003el\u003c/b\u003e Me gusta el post","flag":"\u003cb\u003e!\u003c/b\u003e Reportar post","bookmark":"\u003cb\u003eb\u003c/b\u003e Marcar post","edit":"\u003cb\u003ee\u003c/b\u003e Editar post","delete":"\u003cb\u003ed\u003c/b\u003e Borrar post","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Silenciar tema","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Marcar este tema como normal (por defecto)","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Seguir tema","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Vigilar Tema"}},"badges":{"title":"Distintivos","allow_title":"puede ser utilizado como título","multiple_grant":"puede ser otorgado varias veces","badge_count":{"one":"1 distintivo","other":"%{count} distintivos"},"more_badges":{"one":"+1 más","other":"+%{count} Más"},"granted":{"one":"1 concedido","other":"%{count} concedido"},"select_badge_for_title":"Seleccionar un distintivo para utilizar como tu título","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Primeros pasos"},"community":{"name":"Comunidad"},"trust_level":{"name":"Nivel de confianza"},"other":{"name":"Miscelánea"},"posting":{"name":"Escritura"}},"badge":{"editor":{"name":"Editor","description":"Editó un post por primera vez"},"basic_user":{"name":"Básico","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eDispone\u003c/a\u003e de todas las funciones esenciales de la comunidad"},"member":{"name":"Miembro","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eSe le conceden\u003c/a\u003e invitaciones"},"regular":{"name":"Habitual","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eSe le concede\u003c/a\u003e el poder recategorizar, renombrar, publicar enlacer sin el tag no-follow y acceso a sala vip"},"leader":{"name":"Líder","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eSe le concede\u003c/a\u003e el poder editar, destacar, cerrar, archivar, dividir y combinar temas globalmente"},"welcome":{"name":"¡Bienvenido/a!","description":"Recibió un \"me gusta\""},"autobiographer":{"name":"Autobiógrafo","description":"Detalló información en su \u003ca href=\"/my/preferences\"\u003eperfil\u003c/a\u003e de usuario"},"anniversary":{"name":"Aniversario","description":"Miembro activo desde hace un año y ha publicado al menos una vez"},"nice_post":{"name":"Buen post","description":"Recibió 10 \"me gusta\" en un post. Este distintivo puede ser concedido varias veces"},"good_post":{"name":"Gran post","description":"Recibió 25 \"me gusta\" en un post. Este distintivo puede ser concedido varias veces"},"great_post":{"name":"Excelente post","description":"Recibió 50 \"me gusta\" en un post. Este distintivo puede ser concedido varias veces"},"nice_topic":{"name":"Buen tema","description":"Recibió 10 \"me gusta\" en un tema. Este distintivo puede ser concedido varias veces"},"good_topic":{"name":"Gran tema","description":"Recibió 25 \"me gusta\" en un tema. Este distintivo puede ser concedido varias veces"},"great_topic":{"name":"Excelente tema","description":"Recibió 50 \"me gusta\" en un tema. Este distintivo puede ser concedido varias veces"},"nice_share":{"name":"Buena contribución","description":"Compartió un post con 25 visitantes únicos"},"good_share":{"name":"Gran contribución","description":"Compartió un post con 300 visitantes únicos"},"great_share":{"name":"Excelente contribución","description":"Compartió un post con 1000 visitantes únicos"},"first_like":{"name":"Primer \"me gusta\"","description":"Le dio a \"me gusta\" a un post"},"first_flag":{"name":"Primer reporte","description":"Reportó un post"},"promoter":{"name":"Promotor","description":"Invitó a un usuario"},"campaigner":{"name":"Partidiario","description":"Invitó a 3 usuarios básicos (nivel de confianza 1)"},"champion":{"name":"Campeón","description":"Invitó a 5 miembros (nivel de confianza 2)"},"first_share":{"name":"Primer Compartido","description":"Compartió un post"},"first_link":{"name":"Primer Enlace","description":"Añadió un enlace interno a otro tema"},"first_quote":{"name":"Primera Cita","description":"Citó a un usuario"},"read_guidelines":{"name":"Directrices leídas","description":"Leyó las \u003ca href=\"/guidelines\"\u003edirectrices de la comunidad\u003c/a\u003e"},"reader":{"name":"Lector","description":"Leyó todos los posts en un tema con más de 100"},"popular_link":{"name":"Enlace Popular","description":"Publicó un enlace externo con al menos 50 clicks"},"hot_link":{"name":"Enlace Candente","description":"Publicó un enlace externo con al menos 300 clicks"},"famous_link":{"name":"Enlace Famoso","description":"Publicó un enlace externo con al menos 1000 clicks"}}},"google_search":"\u003ch3\u003eBuscar con Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","controls":"Topic Controls"},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'es';
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
// locale : spanish (es)
// author : Julio Napurí : https://github.com/julionc

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    var monthsShortDot = "ene._feb._mar._abr._may._jun._jul._ago._sep._oct._nov._dic.".split("_"),
        monthsShort = "ene_feb_mar_abr_may_jun_jul_ago_sep_oct_nov_dic".split("_");

    return moment.defineLocale('es', {
        months : "enero_febrero_marzo_abril_mayo_junio_julio_agosto_septiembre_octubre_noviembre_diciembre".split("_"),
        monthsShort : function (m, format) {
            if (/-MMM-/.test(format)) {
                return monthsShort[m.month()];
            } else {
                return monthsShortDot[m.month()];
            }
        },
        weekdays : "domingo_lunes_martes_miércoles_jueves_viernes_sábado".split("_"),
        weekdaysShort : "dom._lun._mar._mié._jue._vie._sáb.".split("_"),
        weekdaysMin : "Do_Lu_Ma_Mi_Ju_Vi_Sá".split("_"),
        longDateFormat : {
            LT : "H:mm",
            L : "DD/MM/YYYY",
            LL : "D [de] MMMM [del] YYYY",
            LLL : "D [de] MMMM [del] YYYY LT",
            LLLL : "dddd, D [de] MMMM [del] YYYY LT"
        },
        calendar : {
            sameDay : function () {
                return '[hoy a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            nextDay : function () {
                return '[mañana a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            nextWeek : function () {
                return 'dddd [a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            lastDay : function () {
                return '[ayer a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            lastWeek : function () {
                return '[el] dddd [pasado a la' + ((this.hours() !== 1) ? 's' : '') + '] LT';
            },
            sameElse : 'L'
        },
        relativeTime : {
            future : "en %s",
            past : "hace %s",
            s : "unos segundos",
            m : "un minuto",
            mm : "%d minutos",
            h : "una hora",
            hh : "%d horas",
            d : "un día",
            dd : "%d días",
            M : "un mes",
            MM : "%d meses",
            y : "un año",
            yy : "%d años"
        },
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('D MMMM, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
