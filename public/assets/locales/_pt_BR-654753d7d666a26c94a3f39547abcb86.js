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
MessageFormat.locale.pt_BR = function ( n ) {
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
r += "Há ";
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
r += "<a href='/unread'>1 não lido</a> ";
return r;
},
"other" : function(d){
var r = "";
r += "are <a href='/unread'>" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " não lidos</a> ";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["pt_BR"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "e ";
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
r += " <a href='/new'>1 novo</a> tópico";
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
r += "e ";
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
})() + " novos</a> tópicos";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["pt_BR"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " ou ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "veja outros tópicos em ";
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
} , "posts_likes_MF" : function(){ return "Invalid Format: No 'other' form found in selectFormatPattern 0";}});I18n.translations = {"pt_BR":{"js":{"number":{"format":{"separator":",","delimiter":"."},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Bytes"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}h"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1a","other":"%{count}a"},"over_x_years":{"one":"\u003e 1a","other":"\u003e %{count}a"},"almost_x_years":{"one":"1a","other":"%{count}a"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuto","other":"%{count} minutos"},"x_hours":{"one":"1 hora","other":"%{count} horas"},"x_days":{"one":"1 dia","other":"%{count} dias"},"date_year":"MMM D, YY"},"medium_with_ago":{"x_minutes":{"one":"1 minuto atrás","other":"%{count} minutos atrás"},"x_hours":{"one":"1 hora atrás","other":"%{count} horas atrás"},"x_days":{"one":"1 dia atrás","other":"%{count} dias atrás"}},"later":{"x_days":{"one":"1 dia depois","other":"%{count} dias depois"},"x_months":{"one":"1 mês depois","other":"%{count} meses depois"},"x_years":{"one":"1 ano depois","other":"%{count} anos depois"}}},"share":{"topic":"compartilhe o link desse tópico","post":"post #%{postNumber}","close":"fechar","twitter":"compartilhe este link no Twitter","facebook":"compartilhe este link no Facebook","google+":"compartilhe este link no Google+","email":"enviar esse link para um email"},"action_codes":{"split_topic":"dividiu este tópico %{when}","autoclosed":{"enabled":"fechou %{when}","disabled":"abriu %{when}"},"closed":{"enabled":"fechou %{when}","disabled":"abriu %{when}"},"archived":{"enabled":"arquivou %{when}","disabled":"desarquivou %{when}"},"pinned":{"enabled":"fixou %{when}","disabled":"desafixou %{when}"},"pinned_globally":{"enabled":"fixou globalmente %{when}","disabled":"desafixou %{when}"},"visible":{"enabled":"listou %{when}","disabled":"desalistou %{when}"}},"topic_admin_menu":"ações administrativas do tópico","emails_are_disabled":"Todo o envio de email foi globalmente desabilitado por algum administrador. Nenhum email de notificações de qualquer tipo será enviado.","edit":"edite o título e a categoria deste tópico","not_implemented":"Esse recurso ainda não foi implementado, desculpe!","no_value":"Não","yes_value":"Sim","generic_error":"Pedimos desculpa, ocorreu um erro.","generic_error_with_reason":"Ocorreu um erro: %{error}","sign_up":"Registrar","log_in":"Entrar","age":"Idade","joined":"Aderiu","admin_title":"Admin","flags_title":"Sinalizações","show_more":"mostrar mais","show_help":"opções","links":"Links","links_lowercase":{"one":"link","other":"links"},"faq":"FAQ","guidelines":"Orientações","privacy_policy":"Política de Privacidade","privacy":"Privacidade","terms_of_service":"Termos do Serviço","mobile_view":"VIsualização Mobile","desktop_view":"Visualização Desktop","you":"Você","or":"ou","now":"agora","read_more":"leia mais","more":"Mais","less":"Menos","never":"nunca","daily":"diário","weekly":"semanal","every_two_weeks":"a cada duas semanas","every_three_days":"a cada três dias","max_of_count":"max de {{count}}","alternation":"ou","character_count":{"one":"{{count}} caracter","other":"{{count}} caracteres"},"suggested_topics":{"title":"Tópicos sugeridos"},"about":{"simple_title":"Sobre","title":"Sobre %{title}","stats":"Estatísticas do Site","our_admins":"Nossos administradores","our_moderators":"Nossos moderadores","stat":{"all_time":"Desde o começo","last_7_days":"Últimos 7 dias","last_30_days":"Últimos 30 dias"},"like_count":"Curtidas","topic_count":"Tópicos","post_count":"Mensagens","user_count":"Novos Usuários","active_user_count":"Usuários Ativos","contact":"Contate-nos","contact_info":"Em caso de um evento crítico ou de urgência afetando este site, por favor contacte-nos em %{contact_info}."},"bookmarked":{"title":"Favorito","clear_bookmarks":"Limpar Favoritos","help":{"bookmark":"Clique para adicionar o primeiro post deste tópico aos favoritos","unbookmark":"Clique para remover todos os favoritos neste tópico"}},"bookmarks":{"not_logged_in":"desculpe, você precisa estar logado para favoritar mensagens","created":"você favoritou essa resposta","not_bookmarked":"você já leu esta mensagem; clique para favoritar.","last_read":"este é a última resposta que você leu; clique para favoritar.","remove":"Remover favorito","confirm_clear":"Tem certeza que deseja apagar todos os atalhos deste tópico?"},"topic_count_latest":{"one":"{{count}} tópico novo ou atualizado.","other":"{{count}} tópicos novos ou atualizados."},"topic_count_unread":{"one":"{{count}} tópico não lido.","other":"{{count}} tópicos não lidos."},"topic_count_new":{"one":"{{count}} novo tópico.","other":"{{count}} novos tópicos."},"click_to_show":"Clique para mostrar.","preview":"pré-visualização","cancel":"cancelar","save":"Salvar mudanças","saving":"Salvando...","saved":"Salvo!","upload":"Enviar","uploading":"Enviando...","uploading_filename":"Enviando {{filename}}","uploaded":"Enviado!","enable":"Habilitar","disable":"Desabilitar","undo":"Desfazer","revert":"Reverter","failed":"Falhou","switch_to_anon":"Modo Anônimo","switch_from_anon":"Sair do Modo Anônimo","banner":{"close":"Ignorar este banner.","edit":"Editar este banner \u003e\u003e"},"choose_topic":{"none_found":"Nenhum tópico encontrado.","title":{"search":"Procurar por um Tópico pelo nome, url ou id:","placeholder":"digite o título do tópico aqui"}},"queue":{"topic":"Tópico:","approve":"Aprovar","reject":"Rejeitar","delete_user":"Deletar Usuário","title":"Aprovação Necessária","none":"Não existem mensagens para revisar.","edit":"Editar","cancel":"Cancelar","view_pending":"ver mensagens pendentes","has_pending_posts":{"one":"Este tópico tem \u003cb\u003e1\u003c/b\u003e mensagem aguardando aprovação","other":"Este tópico tem \u003cb\u003e{{count}}\u003c/b\u003e mensagens aguardando aprovação"},"confirm":"Salvar Mudanças","delete_prompt":"Você tem certeza que deseja deletar \u003cb\u003e%{username}\u003c/b\u003e? Isso irá remover todas as mensagens e irá bloquear o email e endereço IP desse usuário.","approval":{"title":"Aprovação Necessária da Mensagem","description":"Nós recebemos sua nova postagem mas é necessário que seja aprovada por um moderador antes de ser exibida. Por favor tenha paciência.","pending_posts":{"one":"Você tem \u003cstrong\u003e1\u003c/strong\u003e mensagem pendente.","other":"Você tem \u003cstrong\u003e{{count}}\u003c/strong\u003e mensagens pendentes."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e postou \u003ca href='{{topicUrl}}'\u003eo tópico\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003eVocê\u003c/a\u003e postou \u003ca href='{{topicUrl}}'\u003eo tópico\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e respondeu \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003eVocê\u003c/a\u003e respondeu a \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e respondeu ao \u003ca href='{{topicUrl}}'\u003etópico\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eVocê\u003c/a\u003e respondeu ao \u003ca href='{{topicUrl}}'\u003etópico\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mencionou \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mencionou \u003ca href='{{user2Url}}'\u003evocê\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eVocê\u003c/a\u003e mencionou \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Enviado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Enviado por \u003ca href='{{userUrl}}'\u003evocê\u003c/a\u003e","sent_by_user":"Enviado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Enviado por \u003ca href='{{userUrl}}'\u003evocê\u003c/a\u003e"},"directory":{"filter_name":"filtrar por nome de usuário","title":"Usuários","likes_given":"Dados","likes_received":"Recebidos","topics_entered":"Registrados","topics_entered_long":"Tópicos Registrados","time_read":"Tempo Lido","topic_count":"Tópicos","topic_count_long":"Tópicos Criados","post_count":"Respostas","post_count_long":"Respostas Postadas","no_results":"Nenhum resultado foi encontrado.","days_visited":"Visitas","days_visited_long":"Dias Visitados","posts_read":"Lidos","posts_read_long":"Postagens Lidas","total_rows":{"one":"1 usuário","other":"%{count} usuários"}},"groups":{"add":"Adicionar","selector_placeholder":"Adicionar membros","owner":"proprietário","visible":"Grupo é visível para todos os usuários","title":{"one":"grupo","other":"grupos"},"members":"Membros","posts":"Mensagens","alias_levels":{"title":"Quem pode usar este grupo como um apelido?","nobody":"Ninguém","only_admins":"Somente administradores","mods_and_admins":"Somente moderadores e Administradores","members_mods_and_admins":"Somente membros do grupo, moderadores e administradores","everyone":"Todos"},"trust_levels":{"title":"Nível de Confiança automaticamente concedido aos membros quando eles são incluídos","none":"Nenhum"}},"user_action_groups":{"1":"Curtidas dadas","2":"Curtidas recebidas","3":"Favoritos","4":"Tópicos","5":"Respostas","6":"Respostas","7":"Menções","9":"Citações","10":"Favoritos","11":"Edições","12":"Itens enviados","13":"Caixa de Entrada","14":"Pendente"},"categories":{"all":"todas as categorias","all_subcategories":"todos","no_subcategory":"nenhum","category":"Categoria","reorder":{"title":"Reordenar Categorias","title_long":"Reorganizar a lista de categorias","fix_order":"Fixar Posições","fix_order_tooltip":"Algumas categorias não possuem um número de posição único, o que pode causar resultados inesperados.","save":"Salvar Ordem","apply_all":"Aplicar","position":"Posição"},"posts":"Respostas","topics":"Tópicos","latest":"Recentes","latest_by":"recentes por","toggle_ordering":"alternar controle de ordenação","subcategories":"Subcategorias","topic_stats":"O número de novos tópicos.","topic_stat_sentence":{"one":"%{count} novo tópico nos últimos %{unit}.","other":"%{count} novos tópicos nos últimos %{unit}."},"post_stats":"O número de mensagens novas.","post_stat_sentence":{"one":"%{count} nova mensagem nos últimos %{unit}.","other":"%{count} novas mensagens nos últimos %{unit}."}},"ip_lookup":{"title":"Pesquisa do endereço de IP","hostname":"Nome do host","location":"Localização","location_not_found":"(desconhecido)","organisation":"Organização","phone":"Telefone","other_accounts":"Outras contas com esse endereço de IP:","delete_other_accounts":"Excluir %{count}","username":"nome de usuário","trust_level":"TL","read_time":"tempo de leitura","topics_entered":"tópicos em que entrou","post_count":"# mensagens","confirm_delete_other_accounts":"Você tem certeza que deseja apagar essas contas?"},"user_fields":{"none":"(selecione uma opção)"},"user":{"said":"{{username}}:","profile":"Perfil","mute":"Silenciar","edit":"Editar Preferências","download_archive":"Fazer Download dos Meus Posts","new_private_message":"Nova Mensagem","private_message":"Mensagem","private_messages":"Mensagens","activity_stream":"Atividade","preferences":"Preferências","expand_profile":"Expandir","bookmarks":"Favoritos","bio":"Sobre mim","invited_by":"Convidado por","trust_level":"Nível de Confiança","notifications":"Notificações","desktop_notifications":{"label":"Notificações de Área de Trabalho","not_supported":"Notificações não são suportadas nesse browser. Desculpe-nos.","perm_default":"Habilitar Notificações","perm_denied_btn":"Permissão Negada","perm_denied_expl":"Você negou permissões para as notificações. Utilize seu navegador para habilitar notificações, e depois, clique no botão. (Desktop: O ícone mais a esquerda da barra de endereços. Dispositivos Móveis: 'Configurações do Site')","disable":"Desativar Notificações","currently_enabled":"(atualmente ativado)","enable":"Ativar Notificações","currently_disabled":"(atualmente desativado)","each_browser_note":"Nota: Você deve modificar essa configuração em todos navegadores que você usa."},"dismiss_notifications":"Marcar todas como lidas","dismiss_notifications_tooltip":"Marcar todas as notificações não lidas como lidos","disable_jump_reply":"Não pular para o meu tópico depois que eu respondo","dynamic_favicon":"Exibir ícone no navegador de tópicos novos / atualizados.","edit_history_public":"Deixar que os outros usuários visualizem minhas revisões na resposta","external_links_in_new_tab":"Abrir todos os links externos em uma nova aba","enable_quoting":"Ativar resposta citando o texto destacado","change":"alterar","moderator":"{{user}} é um moderador","admin":"{{user}} é um administrador","moderator_tooltip":"Esse usuário é da moderação","admin_tooltip":"Esse usuário é da administração","blocked_tooltip":"Esse usuário está bloqueado.","suspended_notice":"Esse usuário está suspenso até {{date}}.","suspended_reason":"Motivo:","github_profile":"Github","mailing_list_mode":"Me envie um email para cada novo post (a menos que eu torne o tópico ou a categoria mudos)","watched_categories":"Acompanhados","watched_categories_instructions":"Você vai acompanhar automaticamente todos os novos tópicos dessas categorias. Você será notificado de todas as novas mensagens e tópicos.  Além disso, a contagem de mensagens não lidas e novas também aparecerá ao lado do tópico.","tracked_categories":"Monitorado","tracked_categories_instructions":"Automaticamente monitora todos novos tópicos nestas categorias. Uma contagem de posts não lidos e novos aparecerá próximo ao tópico.","muted_categories":"Silenciado","muted_categories_instructions":"Você não será notificado sobre novos tópicos nessas categorias, e não aparecerão no Recentes","delete_account":"Excluir Minha Conta","delete_account_confirm":"Tem certeza de que deseja excluir permanentemente a sua conta? Essa ação não pode ser desfeita!","deleted_yourself":"Sua conta foi excluída com sucesso.","delete_yourself_not_allowed":"Você não pode excluir a sua conta agora. Contate um administrador para apagar a sua conta para você.","unread_message_count":"Mensagens Privadas","admin_delete":"Apagar","users":"Usuários","muted_users":"Silenciado","muted_users_instructions":"Suprimir todas as notificações destes usuários.","muted_topics_link":"Mostrar tópicos silenciados","staff_counters":{"flags_given":"sinalizadas úteis","flagged_posts":"posts marcados","deleted_posts":"posts apagados","suspensions":"suspensões","warnings_received":"avisos"},"messages":{"all":"Todas","mine":"Minha","unread":"Não lidas"},"change_password":{"success":"(email enviado)","in_progress":"(enviando email)","error":"(erro)","action":"alterar","set_password":"Definir Senha"},"change_about":{"title":"Modificar Sobre Mim","error":"Houve um erro ao alterar este valor."},"change_username":{"title":"Alterar Nome de Usuário","confirm":"Se você mudar seu Nome de Usuário, todas as citações das suas respostas e as menções ao seu @nome vão quebrar. Você tem certeza?","taken":"Desculpe, esse Nome de Usuário já está sendo usado.","error":"Houve um erro ao alterar o seu Nome de Usuário.","invalid":"Esse Nome de Usuário é inválido. Deve conter apenas números e letras."},"change_email":{"title":"Alterar Email","taken":"Desculpe, esse email não é válido.","error":"Houve um erro ao alterar seu email. Talvez ele já esteja sendo usado neste forum?","success":"Enviamos um email para esse endereço. Por favor, siga as instruções de confirmação."},"change_avatar":{"title":"Mudar sua imagem de perfil","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, baseado em","gravatar_title":"Alterar seu avatar no site do Gravatar","refresh_gravatar_title":"Atualizar o Gravatar","letter_based":"Imagem de perfil dada pelo sistema","uploaded_avatar":"Foto pessoal","uploaded_avatar_empty":"Adicionar foto pessoal","upload_title":"Enviar sua foto","upload_picture":"Enviar imagem","image_is_not_a_square":"Aviso: nós cortamos sua imagem; largura e altura não eram iguais.","cache_notice":"Você alterou sua foto de perfil com sucesso, porém pode levar algum tempo para que a mesma apareça devido ao cachê do navegador."},"change_profile_background":{"title":"Fundo do perfil","instructions":"Fundos do perfil será centralizado e tera uma largura padrão de 850px."},"change_card_background":{"title":"Plano de fundo de usuário","instructions":"As Imagens de fundo serão centralizadas e deverão ter largura de 590px"},"email":{"title":"Email","instructions":"Nunca mostrar ao público","ok":"Nós vamos pedir confirmação por email","invalid":"Insira um endereço de email","authenticated":"Seu email foi autenticado por {{provider}}"},"name":{"title":"Nome","instructions":"Seu nome completo (opcional)","instructions_required":"Seu nome completo","too_short":"Seu nome é muito curto","ok":"Seu nome parece bom"},"username":{"title":"Nome de Usuário","instructions":"Únicos, sem espaços e curto","short_instructions":"As pessoas podem mencionar você usando @{{username}}.","available":"Seu nome de usuário está disponível","global_match":"O email corresponde ao nome de usuário registrado","global_mismatch":"Já está registado. Tente {{suggestion}}?","not_available":"Não está disponível. Tente {{suggestion}}?","too_short":"Seu nome de usuário é muito curto","too_long":"Seu nome de usuário é muito longo","checking":"Verificando disponibilidade do Nome de Usuário...","enter_email":"Nome de usuário encontrado, insira o email correspondente. ","prefilled":"Email corresponde a esse nome de usuário registrado"},"locale":{"title":"idioma da interface","instructions":"Idioma da interface de usuário. Irá mudar quando você atualizar a página.","default":"(padrão)"},"password_confirmation":{"title":"Senha novamente"},"last_posted":"Última resposta","last_emailed":"Último email enviado","last_seen":"Visto","created":"Entrou","log_out":"Log Out","location":"Localização","card_badge":{"title":"Cartão de emblemas do usuário"},"website":"Web Site","email_settings":"Email","email_digests":{"title":"Quando eu não visitar aqui, envie um resumo via email do que há de novo:","daily":"diariamente","every_three_days":"a cada três dias","weekly":"semanalmente","every_two_weeks":"a cada duas semanas"},"email_direct":"Me envie um email quando alguém me citar, responder minhas mensagens, mencionar meu @usuário, ou me convidar para um tópico","email_private_messages":"Me envie um email quando alguém me enviar mensagem particular","email_always":"Envie-me notificações mesmo quando eu estiver ativo no site.","other_settings":"Outros","categories_settings":"Categorias","new_topic_duration":{"label":"Considerar tópicos como novos quando","not_viewed":"Eu ainda não os vi","last_here":"criado desde de que eu estava aqui pela última vez","after_1_day":"criado(s) no último(s) dia","after_2_days":"criado(s) nos último(s) 2 dias","after_1_week":"criado na última semana","after_2_weeks":"criado nas últimas 2 semanas"},"auto_track_topics":"Seguir automaticamente tópicos que eu entro","auto_track_options":{"never":"nunca","immediately":"imediatamente","after_30_seconds":"depois de 30 segundos","after_1_minute":"depois de 1 minuto","after_2_minutes":"depois de 2 minutos","after_3_minutes":"depois de 3 minutos","after_4_minutes":"depois de 4 minutos","after_5_minutes":"depois de 5 minutos","after_10_minutes":"depois de 10 minutos"},"invited":{"search":"digite para pesquisar convites...","title":"Convites","user":"Usuários convidados","sent":"Enviado","none":"Não existem convites pendentes para exibir.","truncated":{"one":"Mostrando os primeiro convite.","other":"Mostrando os primeiros {{count}} convites."},"redeemed":"Convites usados","redeemed_tab":"Resgatado","redeemed_tab_with_count":"Resgatado ({{count}})","redeemed_at":"Usado","pending":"Convites pendentes","pending_tab":"Pendente","pending_tab_with_count":"Pendente ({{count}})","topics_entered":"Tópicos vistos","posts_read_count":"Mensagens vistas","expired":"Este convite expirou.","rescind":"Remover","rescinded":"Convite removido","reinvite":"Reenviar convite","reinvited":"Convite re-enviado","time_read":"Tempo de leitura","days_visited":"Dias visitados","account_age_days":"Idade da conta em dias","create":"Enviar um convite","generate_link":"Copiar Link do Convite","generated_link_message":"\u003cp\u003eLink do convite gerado com sucesso!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eLink do convite válido apenas para este endereço de email: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Você ainda não convidou ninguém. Você pode enviar convites individuais, ou enviar vários de uma vez através da ferramenta de \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003eenviar em massa\u003c/a\u003e.","text":"Convidar em massa a partir de arquivo","uploading":"Subindo...","success":"Arquivo enviado com sucesso, você será notificado por mensagem quando o processo estiver completo.","error":"Houve um erro ao enviar '{{filename}}': {{message}}"}},"password":{"title":"Senha","too_short":"A sua senha é muito curta.","common":"Essa senha é muito comum.","same_as_username":"Sua senha é a mesma que o seu nome de usuário.","same_as_email":"Sua senha é a mesma que o seu email.","ok":"A sua senha parece boa.","instructions":"Deve ter pelo menos %{count} caracteres."},"associated_accounts":"Logins","ip_address":{"title":"Último endereço IP"},"registration_ip_address":{"title":"Endereço IP de Registro"},"avatar":{"title":"Imagem de Perfil","header_title":"perfil, mensagens, favoritos e preferências"},"title":{"title":"Título"},"filters":{"all":"Todos"},"stream":{"posted_by":"Postado por","sent_by":"Enviado por","private_message":"mensagem","the_topic":"o tópico"}},"loading":"Carregando...","errors":{"prev_page":"ao tentar carregar","reasons":{"network":"Erro de Rede","server":"Erro de Servidor","forbidden":"Acesso Negado","unknown":"Erro","not_found":"Página não encontrada"},"desc":{"network":"Por favor verifique sua conexão.","network_fixed":"Parece que voltou.","server":"Código de erro: {{status}}","forbidden":"Você não tem permissão para ver isso.","not_found":"Oops, a aplicação tentou carregar uma URL que não existe.","unknown":"Algo deu errado."},"buttons":{"back":"Voltar","again":"Tentar de novo","fixed":"Carregar Página"}},"close":"Fechar","assets_changed_confirm":"Este site foi atualizado. Obter a última versão?","logout":"Você foi desconectado.","refresh":"Atualizar","read_only_mode":{"enabled":"O modo somente-leitura está habilitado. Você pode navegador mas as interações podem não funcionar.","login_disabled":"Login é desativado enquanto o site está em modo de somente leitura."},"too_few_topics_and_posts_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar essa discussão!\u003c/a\u003e Existem atualmente \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tópicos e \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensagens. Novos visitantes precisam de algumas conversas para ler e responder.","too_few_topics_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar essa discussão!\u003c/a\u003e Existem atualmente \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tópicos. Novos visitantes precisam de algumas conversas para ler e responder.","too_few_posts_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar essa discussão!\u003c/a\u003e Existem atualmente \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensagens. Novos visitantes precisam de algumas conversas para ler e responder.","learn_more":"aprenda mais...","year":"ano","year_desc":"tópicos criados nos últimos 365 dias","month":"mês","month_desc":"tópicos criados nos últimos 30 dias","week":"semana","week_desc":"tópicos criados nos últimos 7 dias","day":"dia","first_post":"Primeira resposta","mute":"Silenciar","unmute":"Reativar","last_post":"Última resposta","last_reply_lowercase":"última resposta","replies_lowercase":{"one":"resposta","other":"respostas"},"signup_cta":{"sign_up":"Registrar-se","hide_session":"Lembre-me amanhã","hide_forever":"não obrigado","hidden_for_session":"OK, Eu vou perguntar amanhã. Você pode também sempre usar o 'Registre-se' para criar uma conta.","intro":"Ei você! :heart_eyes: Para que você está gostando da discussão, mas ainda não criou uma conta.","value_prop":"Quando você cria uma conta, nós lembramos exatamente o que você leu, assim você sempre volta exatamente aonde estava. Você também recebe notificações, aqui e por e-mail, quando novas mensagens são feitas. E você pode curtir tópicos para compartilhar o amor. :heartbeat:"},"summary":{"enabled_description":"Você está vendo um sumário deste tópico: os posts mais interessantes conforme determinados pela comunidade.","description":"Há \u003cb\u003e{{count}}\u003c/b\u003e respostas.","description_time":"Há \u003cb\u003e{{count}}\u003c/b\u003e respostas com um tempo de leitura estimado de \u003cb\u003e{{readingTime}} minutos\u003c/b\u003e.","enable":"Resumir Este Tópico","disable":"Exibir Todas as Mensagens"},"deleted_filter":{"enabled_description":"Este tópico contém posts deletados, que foram escondidos.","disabled_description":"Os posts deletados deste tópico estão sendo mostrados.","enable":"Esconder respostas apagadas","disable":"Mostrar Posts Deletados"},"private_message_info":{"title":"Mensagem","invite":"Convidar outros...","remove_allowed_user":"Tem a certeza que deseja remover {{name}} desta mensagem?"},"email":"Email","username":"Nome de Usuário","last_seen":"Visto","created":"Criado","created_lowercase":"criado","trust_level":"Nível de confiança","search_hint":"nome de usuário, email ou endereço de IP","create_account":{"title":"Criar nova conta","failed":"Alguma coisa deu errado, talvez este email já esteja registrado, tente usar o Esqueci a Senha."},"forgot_password":{"title":"Redefinir Senha","action":"Esqueci minha senha","invite":"Coloque seu Nome de Usuário ou endereço de email, e nós lhe enviaremos um email para refazer sua senha.","reset":"Recuperar senha","complete_username":"Se uma conta corresponder a este usuário \u003cb\u003e%{username}\u003c/b\u003e, você receberá um email com instruções de como reiniciar sua senha rapidamente.","complete_email":"Se uma conta corresponder a este email \u003cb\u003e%{email}\u003c/b\u003e, você receberá um email com instruções de como reiniciar sua senha rapidamente.","complete_username_found":"Encontramos uma conta que possui o nome de usuário \u003cb\u003e%{username}\u003c/b\u003e, você deverá receber um email com instruções em como resetar sua senha em breve.","complete_email_found":"Encontramos uma conta com \u003cb\u003e%{email}\u003c/b\u003e, você deve receber um email com instruções em como resetar sua senha em breve.","complete_username_not_found":"Nenhuma conta com usuário \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Nenhuma conta com \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Log In","username":"Usuário","password":"Senha","email_placeholder":"e-mail ou Nome de Usuário","caps_lock_warning":"CAIXA ALTA está ligado","error":"Erro desconhecido","rate_limit":"Por favor aguarde antes de tentar logar novamente.","blank_username_or_password":"Por favor, coloque seu email ou Nome de Usuário, e senha.","reset_password":"Recuperar senha","logging_in":"Entrando...","or":"Ou","authenticating":"Autenticando...","awaiting_confirmation":"A sua conta está aguardando ativação, utilize o link 'Esqueci a Senha' para pedir um novo link para ativar o email.","awaiting_approval":"Sua conta ainda não foi aprovada por um membro da equipe. Você receberá um email quando sua conta for aprovada.","requires_invite":"Desculpe, o acesso a este fórum é permitido somente por convite de outro membro.","not_activated":"Você não pode entrar ainda. Nós lhe enviamos um email de ativação anteriormente no endereço \u003cb\u003e{{sentTo}}\u003c/b\u003e. Por favor siga as instruções contidas neste email para ativar a sua conta.","not_allowed_from_ip_address":"Você não pode logar deste endereço IP.","admin_not_allowed_from_ip_address":"Você não pode entrar como administrador a partir deste endereço IP.","resend_activation_email":"Clique aqui para enviar o email de ativação novamente.","sent_activation_email_again":"Nós enviamos mais um email de ativação para você no endereço \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Pode ser que demore alguns minutos para chegar; verifique sempre sua caixa de spams.","to_continue":"Por favor efetue o login","preferences":"Você precisa estar logado para mudar suas preferências de usuário.","forgot":"Não me recordo dos detalhes da minha conta.","google":{"title":"Entrar com Google","message":"Autenticando com Google (certifique-se de que os bloqueadores de popup estejam desativados)"},"google_oauth2":{"title":"com Google","message":"Autenticação com o Google (tenha certeza que bloqueadores de popup não estão ligados)"},"twitter":{"title":"Entrar com Twitter","message":"Autenticando com Twitter (certifique-se de que os bloqueadores de popup estejam desativados)"},"facebook":{"title":"Entrar com Facebook","message":"Autenticando com Facebook (certifique-se de que os bloqueadores de popup estejam desativados)"},"yahoo":{"title":"Entrar com Yahoo","message":"Autenticando com Yahoo (certifique-se de que os bloqueadores de popup estejam desativados)"},"github":{"title":"com GitHub","message":"Autenticando com GitHub (certifique-se de que os bloqueadores de popup estejam desativados)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"mais...","options":"Opções","whisper":"sussuro","add_warning":"Este é um aviso oficial.","toggle_whisper":"Habilitar Sussuro","posting_not_on_topic":"Qual tópico você gostaria de responder?","saving_draft_tip":"gravando...","saved_draft_tip":"salvo","saved_local_draft_tip":"salvo localmente","similar_topics":"Seu tópico é parecido com...","drafts_offline":"rascunhos offline","error":{"title_missing":"Título é obrigatório","title_too_short":"O título tem que ter no mínimo {{min}} caracteres","title_too_long":"O título não pode ter mais de {{max}} caracteres","post_missing":"A resposta não pode estar vazia","post_length":"A resposta tem que ter no mínimo {{min}} caracteres","try_like":"Já tentou o botão \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Você precisa escolher uma categoria"},"save_edit":"Salvar alterações","reply_original":"Responder em um Tópico Novo","reply_here":"Responda aqui","reply":"Responder","cancel":"Cancelar","create_topic":"Criar Tópico","create_pm":"Mensagem","title":"Ou pressione Ctrl+Enter","users_placeholder":"Adicionar um usuário","title_placeholder":"Sobre o que é esta discussão em uma pequena frase?","edit_reason_placeholder":"por que você está editando?","show_edit_reason":"(adicione motivo da edição)","reply_placeholder":"Escreva aqui. Use Markdown, BBCode ou HTML para formatar. Arraste ou cole uma imagens.","view_new_post":"Ver sua nova resposta.","saving":"Salvando","saved":"Salvo!","saved_draft":"Rascunho salvo, clique em selecionar para continuar editando.","uploading":"Enviando...","show_preview":"mostrar pré-visualização \u0026raquo;","hide_preview":"\u0026laquo; esconder pré-visualização","quote_post_title":"Citar toda a resposta","bold_title":"Negrito","bold_text":"texto em negrito","italic_title":"Itálico","italic_text":"texto em itálico","link_title":"Link","link_description":"digite a descrição do link aqui","link_dialog_title":"Inserir link","link_optional_text":"título opcional","link_placeholder":"http://example.com \"texto opcional\"","quote_title":"Bloco de citação","quote_text":"Bloco de citação","code_title":"Texto pré-formatado","code_text":"identar texto pre-formatado em 4 espaços","upload_title":"Enviar","upload_description":"digite aqui a descrição do arquivo enviado","olist_title":"Lista numerada","ulist_title":"Lista de itens","list_item":"Item da lista","heading_title":"Título","heading_text":"Título","hr_title":"Barra horizontal","help":"Ajuda da edição Markdown","toggler":"esconder ou exibir o painel de composição","modal_ok":"OK","modal_cancel":"Cancelar","cant_send_pm":"Desculpe, você não pode enviar uma mensagem para %{username}.","admin_options_title":"Configurações opcionais da equipe para este tópico","auto_close":{"label":"Tempo para fechamento automático do tópico:","error":"Por favor, digite um valor válido.","based_on_last_post":"Não feche até que o último post no tópico seja o mais velho.","all":{"examples":"Insira o número de horaas (24), hora absoluta (17:30) ou o timestamp (2013-11-22 14:00)."},"limited":{"units":"(núm. de horas)","examples":"Insira o número de horas (24)."}}},"notifications":{"title":"notificações de menção de @name, respostas às suas postagens,  tópicos, mensagens, etc","none":"Não foi possível carregar notificações no momento.","more":"ver notificações antigas","total_flagged":"total de mensagens sinalizadas","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e accepted your invitation\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moved {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eAdquirido '{{description}}'\u003c/p\u003e","alt":{"mentioned":"Mencionado por","quoted":"Citado por","replied":"Respondido","posted":"Mensagem por","edited":"Edição na sua mensagem por","liked":"Curtiu sua mensagem","private_message":"Mensagem privada de","invited_to_private_message":"Convidou para uma mensagem privada","invited_to_topic":"Convite para um tópico de","invitee_accepted":"Convite aceito por","moved_post":"Seu tópico foi movido por","linked":"Link para sua mensagem","granted_badge":"Emblema recebido"},"popup":{"mentioned":"{{username}} mencionou você em \"{{topic}}\" - {{site_title}}","quoted":"{{username}} citou você em \"{{topic}}\" - {{site_title}}","replied":"{{username}} respondeu para você em \"{{topic}}\" - {{site_title}}","posted":"{{username}} postou em \"{{topic}}\" - {{site_title}}","private_message":"{{username}} enviou uma mensagem particular para você em \"{{topic}}\" - {{site_title}}","linked":"{{username}} linkou o seu post de \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Adicionar uma imagem","title_with_attachments":"Adicionar uma imagem ou arquivo","from_my_computer":"Do meu dispositivo","from_the_web":"Da internet","remote_tip":"link da imagem","remote_tip_with_attachments":"link para imagem ou arquivo {{authorized_extensions}}","local_tip":"selecione imagens a partir do seu dispositivo","local_tip_with_attachments":"selecione imagens ou arquivos do seu dispositivo {{authorized_extensions}}","hint":"(Você também pode arrastar e soltar para o editor para carregá-las)","hint_for_supported_browsers":"Você pode também arrastar e soltar ou copiar imagens no editor","uploading":"Enviando","select_file":"Selecionar Arquivo","image_link":"link da sua imagem"},"search":{"sort_by":"Ordenar por","relevance":"Relevância","latest_post":"Última Mensagem","most_viewed":"Mais Visto","most_liked":"Mais Curtido","select_all":"Selecionar Todos","clear_all":"Limpar Todos","result_count":{"one":"1 resultado para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} resultados para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"procurar em tópicos, respostas, usuários ou categorias","no_results":"Nenhum resultado encontrado.","no_more_results":"Sem mais resultados encontrados.","search_help":"Ajuda na busca","searching":"Procurando...","post_format":"#{{post_number}} por {{username}}","context":{"user":"Procurar respostas de @{{username}}","category":"Procurar a categoria \"{{category}}\"","topic":"Procurar nesse tópico","private_messages":"Procurar mensagens"}},"hamburger_menu":"ir para outra listagem de tópicos ou categoria","new_item":"novo","go_back":"voltar","not_logged_in_user":"página do usuário com resumo de atividades correntes e preferencias","current_user":"ir para a sua página de usuário","topics":{"bulk":{"unlist_topics":"Tópicos Não Listados","reset_read":"Redefinir Lido","delete":"Apagar Tópicos","dismiss":"Marcar como lida","dismiss_read":"Marcar todas como lida","dismiss_button":"Descartar...","also_dismiss_topics":"Parar de monitorar estes tópicos? (Não aparecerão na aba de não lidos)","dismiss_new":"Dispensar Nova","toggle":"alternar a seleção em massa de tópicos","actions":"Ações em Massa","change_category":"Mudar Categoria","close_topics":"Fechar Tópicos","archive_topics":"Arquivar Tópicos","notification_level":"Modificar Nível de Notificação","choose_new_category":"Escolha a nova categoria para os tópicos:","selected":{"one":"Você selecionou \u003cb\u003e1\u003c/b\u003e tópico.","other":"Você selecionou \u003cb\u003e{{count}}\u003c/b\u003e tópicos."}},"none":{"unread":"Não há nenhum tópico não lido.","new":"Não há tópicos novos.","read":"Você ainda não leu nenhum tópico.","posted":"Você ainda não postou nenhum tópico.","latest":"Não há tópicos recentes. Isso é triste.","hot":"Não há tópicos quentes.","bookmarks":"Você ainda não tem tópicos nos favoritos.","category":"Não há tópicos na categoria {{category}}.","top":"Não há tópicos em alta.","search":"Não foram encontrados resultados.","educate":{"new":"\u003cp\u003eSeus novos tópicos aparecerão aqui.\u003c/p\u003e\u003cp\u003ePor padrão, tópicos são considerados novos e irão mostrar um indicador \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enovo\u003c/span\u003e se eles foram criados nos últimos 2 dias.\u003c/p\u003e\u003cp\u003eVocê pode mudar isto nas suas \u003ca href=\"%{userPrefsUrl}\"\u003epreferências\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eSeus tópicos não lidos aparecerão aqui.\u003c/p\u003e\u003cp\u003ePor padrão, tópicos são considerados não lidos e irão mostrar contadores \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e se você:\u003c/p\u003e\u003cul\u003e\u003cli\u003eCriou o tópico\u003c/li\u003e\u003cli\u003eRespondeu para o tópico\u003c/li\u003e\u003cli\u003eLeu o tópico por mais de 4 minutos\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOu se você explicitamente marcou o tópico para Acompanhar ou Assistir via o controle de notificação na parte de baixo de cada tópico.\u003c/p\u003e\u003cp\u003eVocê pode mudar isto nas suas \u003ca href=\"%{userPrefsUrl}\"\u003epreferências\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Não há mais tópicos recentes.","hot":"Não mais tópicos quentes.","posted":"Não há mais tópicos postados.","read":"Não há mais tópicos lidos.","new":"Não há mais tópicos novos.","unread":"Não há mais tópicos não lidos.","category":"Não há mais tópicos na categoria {{category}}.","top":"Não há mais tópicos em alta.","bookmarks":"Não há mais tópicos nos favoritos.","search":"Não existem mais resultados."}},"topic":{"unsubscribe":{"stop_notifications":"Você agora vai receber menos notificações de \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Seu estado de notificação atual é"},"filter_to":"{{post_count}} mensagens no tópico","create":"Novo tópico","create_long":"Criar um novo tópico","private_message":"Iniciar uma mensagem","list":"Tópicos","new":"novo tópico","unread":"não lido","new_topics":{"one":"1 tópico novo","other":"{{count}} novos tópicos"},"unread_topics":{"one":"1 tópico não lido","other":"{{count}} tópicos não lidos"},"title":"Tópico","invalid_access":{"title":"Tópico é particular","description":"Desculpe, você não tem acesso a esse tópico!","login_required":"Você precisa de logar para ver este tópico."},"server_error":{"title":"Falha ao carregar o tópico","description":"Desculpe, nós não conseguimos carregar este tópico, possivelmente devido a um problema na conexão. Por favor teste novamente. Se o problema persistir, contate-nos."},"not_found":{"title":"Tópico não encontrado","description":"Desculpe, não foi possível encontrar esse tópico. Talvez ele tenha sido apagado?"},"total_unread_posts":{"one":"você tem {{count}} post não lido neste tópico","other":"você tem {{count}} posts não lidos neste tópico"},"unread_posts":{"one":"você possui 1 resposta antiga que não foi lida neste tópico","other":"você possui {{count}} respostas antigas que não foram lidas neste tópico"},"new_posts":{"one":"há 1 nova resposta neste tópico desde a sua última leitura","other":"há {{count}} novas respostas neste tópico desde a sua última leitura"},"likes":{"one":"há 1 curtida neste tópico","other":"há {{count}} curtidas neste tópico"},"back_to_list":"Voltar a lista dos tópicos","options":"Opções do tópico","show_links":"mostrar links dentro desse tópico","toggle_information":"alternar detalhes do tópico","read_more_in_category":"Quer ler mais? Procure outros tópicos em {{catLink}} ou {{latestLink}}.","read_more":"Quer ler mais? {{catLink}} ou {{latestLink}}.","browse_all_categories":"Procurar em todas as categorias","view_latest_topics":"ver tópicos mais recentes","suggest_create_topic":"Que tal criar um tópico?","jump_reply_up":"pular para a resposta mais recente","jump_reply_down":"pular para a resposta mais antiga","deleted":"Este tópico foi apagado","auto_close_notice":"Este tópico vai ser automaticamente fechado em %{timeLeft}.","auto_close_notice_based_on_last_post":"Este tópico fechará %{duration} depois da última resposta.","auto_close_title":"Configurações para fechar automaticamente","auto_close_save":"Salvar","auto_close_remove":"Não fechar automaticamente este tópico","progress":{"title":"progresso do tópico","go_top":"topo","go_bottom":"último","go":"ir","jump_bottom":"ir para a última mensagem","jump_bottom_with_number":"ir para a mensagem %{post_number}","total":"total de mensagens","current":"resposta atual","position":"mensagem %{current} de %{total}"},"notifications":{"reasons":{"3_6":"Você receberá notificações porque você está acompanhando esta categoria.","3_5":"Você receberá notificações porque começou a acompanhar este tópico automaticamente.","3_2":"Você receberá notificações porque está observando este tópico.","3_1":"Você receberá notificações porque criou este tópico.","3":"Você receberá notificações porque você está observando este tópico.","2_8":"Você receberá notificações porque você está monitorando essa categoria.","2_4":"Você receberá notificações porque postou uma resposta neste tópico.","2_2":"Você receberá notificações porque está monitorando este tópico.","2":"Você receberá notificações porque você \u003ca href=\"/users/{{username}}/preferences\"\u003eleu este tópico\u003c/a\u003e.","1_2":"Você será notificado se alguém mencionar o seu @nome ou responder à sua mensagem.","1":"Você será notificado se alguém mencionar o seu @nome ou responder à sua mensagem.","0_7":"Você está ignorando todas as notificações nessa categoria.","0_2":"Você está ignorando todas as notificações deste tópico.","0":"Você está ignorando todas as notificações deste tópico."},"watching_pm":{"title":"Acompanhando","description":"Você será notificado de cada mensagem nova neste tópico. Um contador de mensagens novas e não lidas também aparecerá próximo ao tópico."},"watching":{"title":"Observar","description":"Você será notificado de cada mensagem nova neste tópico. Um contador de mensagens novas e não lidas também aparecerá próximo ao tópico."},"tracking_pm":{"title":"Monitorando","description":"Um contador de novas respostas será mostrado para esta mensagem. Você será notificado se alguém mencionar seu @nome ou responder à sua mensagem."},"tracking":{"title":"Monitorar","description":"Um contador de novas respostas será mostrado para este tópico. Você será notificado se alguém mencionar seu @nome ou responder à sua mensagem."},"regular":{"title":"Normal","description":"Você será notificado se alguém mencionar o seu @nome ou responder à sua mensagem."},"regular_pm":{"title":"Normal","description":"Você será notificado se alguém mencionar o seu @nome ou responder à sua mensagem."},"muted_pm":{"title":"Silenciado","description":"Você nunca será notificado de qualquer coisa sobre essa mensagem privada."},"muted":{"title":"Silenciar"}},"actions":{"recover":"Recuperar Tópico","delete":"Apagar tópico","open":"Abrir tópico","close":"Fechar tópico","multi_select":"Selecionar Mensagens...","auto_close":"Fechar automaticamente...","pin":"Fixar Tópico...","unpin":"Desafixar Tópico...","unarchive":"Desarquivar tópico","archive":"Arquivar tópico","invisible":"Tornar Invisível","visible":"Tornar Visível","reset_read":"Repor data de leitura"},"feature":{"pin":"Fixar Tópico","unpin":"Desafixar Tópico","pin_globally":"Fixar Tópico Globalmente","make_banner":"Banner Tópico","remove_banner":"Remover Banner Tópico"},"reply":{"title":"Responder","help":"comece a compor uma resposta a este tópico"},"clear_pin":{"title":"Remover destaque","help":"Retirar destaque deste tópico para que ele não apareça mais no topo da sua lista de tópicos"},"share":{"title":"Compartilhar","help":"compartilhar um link deste tópico"},"flag_topic":{"title":"Sinalizar","help":"sinaliza privativamente este tópico para chamar atenção ou notificar privativamente sobre isso","success_message":"Você sinalizou com sucesso este tópico."},"feature_topic":{"title":"Destacar este tópico","pin":"Fazer que este tópico apareça no topo da categoria  {{categoryLink}} até","confirm_pin":"Você já tem {{count}} tópicos fixos. Muitos tópicos fixados podem atrapalhar usuários novos e anônimos. Tem certeza que quer fixar outro tópico nesta categoria?","unpin":"Remover este tópico do inicio da {{categoryLink}} categoria.","unpin_until":"Remover este tópico do topo da categoria {{categoryLink}} ou esperar até \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Usuários podem desafixar o tópico individualmente para si.","pin_validation":"Uma data é necessária para fixar este tópico.","pin_globally":"Fazer com que este tópico apareça no topo de todas listas de tópicos até","confirm_pin_globally":"Você já tem {{count}} tópicos fixados globalmente. Muitos tópicos fixados podem prejudicar usuários novos e anônimos. Tem certeza que quer fixar outro tópico globalmente?","unpin_globally":"Remover este tópico do inicio de todas as listas de tópicos.","unpin_globally_until":"Remover este tópico do topo de todas listagens de tópicos ou esperar até \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Usuários podem desafixar o tópico individualmente para si.","not_pinned_globally":"Não existem tópicos fixados globalmente.","make_banner":"Tornar este tópico em um banner que apareça no inicio de todas as páginas.","remove_banner":"Remover o banner que aparece no inicio de todas as páginas.","banner_note":"Usuários podem dispensar o banner fechando-o. Apenas um tópico pode ser colocado como banner a cada momento."},"inviting":"Convidando...","automatically_add_to_groups_optional":"Esse convite também inclui o acesso a esses grupos:  (\u003cb\u003eOpacional\u003c/b\u003e, admins apenas)","automatically_add_to_groups_required":"Esse convite também inclui o acesso a esses grupos:  (\u003cb\u003eNecessário\u003c/b\u003e, admins apenas)","invite_private":{"title":"Convidar para Conversa Privada","email_or_username":"Email ou Nome de Usuário do convidado","email_or_username_placeholder":"email ou Nome de Usuário","action":"Convite","success":"Nós convidamos aquele usuário para participar desta mensagem privada.","error":"Desculpe, houve um erro ao convidar esse usuário.","group_name":"nome do grupo"},"invite_reply":{"title":"Convite","username_placeholder":"nome de usuário","action":"Enviar Convites","help":"Convidar outros para este tópico por email ou notificação","to_forum":"Nós vamos mandar um email curto permitindo seu amigo a entrar e responder a esse tópico clicando em um link, sem necessidade de entrar.","sso_enabled":"Entrar o nome de usuário da pessoa que você gostaria de convidar para este tópico.","to_topic_blank":"Entrar o nome de usuário ou endereço de email da pessoa que você gostaria de convidar para este tópico.","to_topic_email":"Você digitou um endereço de email. Nós enviaremos um convite por email que permite seu amigo responder imediatamente a este tópico.","to_topic_username":"Você inseriu um nome de usuário. Nós vamos enviar uma notificação com um link convidando-o para este tópico.","to_username":"Insira o nome de usuário da pessoa que você gostaria de convidas. Nós vamos enviar uma notificação com um link convidando-o para este tópico.","email_placeholder":"nome@exemplo.com","success_email":"Enviamos um convite para \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Nós notificaremos você quando este convite for resgatado. Verifique a aba de convites na página de seu usuário para acompanhar seus convites.","success_username":"Nós convidamos o usuário para participar neste tópico.","error":"Desculpe, nós não pudemos convidar esta pessoa. Talvez já seja usuário? (convites têm taxa limitada)"},"login_reply":"Logar para Responder","filters":{"n_posts":{"one":"1 mensagem","other":"{{count}} mensagens"},"cancel":"Remover filtro"},"split_topic":{"title":"Mover para novo tópico","action":"mover para novo tópico","topic_name":"Nome do tópico novo","error":"Houve um erro ao mover as mensagens para o novo tópico.","instructions":{"one":"Você está prestes a criar um novo tópico e populá-lo com a resposta que você selecionou.","other":"Você está prestes a criar um novo tópico e populá-lo com as \u003cb\u003e{{count}}\u003c/b\u003e respostas que você selecionou."}},"merge_topic":{"title":"Mover para tópico já existente","action":"mover para tópico já existente","error":"Houve um erro ao mover as mensagens para aquele tópico.","instructions":{"one":"Por favor selecione o tópico para o qual você gostaria de mover esta resposta.","other":"Por favor selecione o tópico para o qual você gostaria de mover estas \u003cb\u003e{{count}}\u003c/b\u003e respostas."}},"change_owner":{"title":"Trocar Autor das Mensagens","action":"trocar autor","error":"Houve um erro ao alterar o autor dessas mensagens.","label":"Novo Autor das Mensagens","placeholder":"novo autor","instructions":{"one":"Por favor, escolha o novo dono do post por  \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Por favor, escolha o novo autor dessas {{count}} mensagens que eram de \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Note que qualquer notificação sobre esta mensagem não irá ser transferida para o novo usuário retroativamente.\u003cbr\u003eAlerta: Atualmente, nenhum dado dependente da mensagem será transferido para o novo usuário. Use com cuidado."},"change_timestamp":{"title":"Alterar Horário","action":"alterar horário","invalid_timestamp":"Horário não pode ser no futuro.","error":"Ocorreu um erro alterando o horário do tópico.","instructions":"Por favor selecione um novo horário para o tópico. Mensagens no tópico serão atualizadas para manter a mesma diferença de tempo."},"multi_select":{"select":"selecionar","selected":"({{count}}) selecionados","select_replies":"selecione +respostas","delete":"apagar selecionados","cancel":"cancelar seleção","select_all":"selecionar tudo","deselect_all":"deselecionar tudo","description":{"one":"\u003cb\u003e1\u003c/b\u003e resposta selecionada.","other":"\u003cb\u003e{{count}}\u003c/b\u003e respostas selecionadas."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"citar resposta","edit":"Em resposta a {{link}} por {{replyAvatar}} {{username}}","edit_reason":"Motivo:","post_number":"resposta {{number}}","last_edited_on":"resposta editada pela última vez em","reply_as_new_topic":"Responder como um Tópico linkado","continue_discussion":"Continuando a discussão do {{postLink}}:","follow_quote":"ir para a resposta citada","show_full":"Exibir mensagem completa","show_hidden":"Ver conteúdo escondido","deleted_by_author":{"one":"(respostas abandonadas pelo autor, serão removidas automaticamente em %{count} hora a exceto se forem sinalizadas)","other":"(respostas abandonadas pelo autor, serão removidas automaticamente em %{count} horas a exceto se forem sinalizadas)"},"expand_collapse":"expandir/encolher","gap":{"one":"ver 1 resposta oculta","other":"ver {{count}} respostas ocultas"},"more_links":"{{count}} mais...","unread":"Resposta não lida","has_replies":{"one":"{{count}} Resposta","other":"{{count}} Respostas"},"has_likes":{"one":"{{count}} Curtida","other":"{{count}} Curtidas"},"has_likes_title":{"one":"{{count}} pessoa curtiu esta mensagem","other":"{{count}} pessoas curtiram esta mensagem"},"has_likes_title_only_you":"você curtiu esta postagem","errors":{"create":"Desculpe, houve um erro ao criar sua resposta. Por favor, tente outra vez.","edit":"Desculpe, houve um erro ao editar sua resposta. Por favor, tente outra vez.","upload":"Desculpe, houve um erro ao enviar esse arquivo. Por favor, tente outra vez.","attachment_too_large":"Desculpe, o arquivo que você está tentando enviar é muito grande (o tamanho máximo permitido é {{max_size_kb}}kb).","file_too_large":"Desculpe, o arquivo que você está tentando enviar é muito grande (o tamanho máximo permitido é {{max_size_kb}}kb).","too_many_uploads":"Desculpe, você pode enviar apenas um arquivos por vez.","too_many_dragged_and_dropped_files":"Desculpe, você pode arrastar \u0026 soltar apenas 10 arquivos por vez.","upload_not_authorized":"Desculpe, o tipo de arquivo que você está tentando enviar não está autorizado (extensões autorizadas: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Desculpe, novos usuário não podem enviar imagens.","attachment_upload_not_allowed_for_new_user":"Desculpe, usuários novos não podem enviar anexos.","attachment_download_requires_login":"Desculpe, você precisa estar logado para baixar arquivos anexos."},"abandon":{"confirm":"Tem certeza que quer abandonar a sua mensagem?","no_value":"Não, manter","yes_value":"Sim, abandone"},"via_email":"post recebido via email","whisper":"esta mensagem é um sussuro privado para moderadores","wiki":{"about":"essa resposta é uma wiki; usuários básicos podem editá-lo"},"archetypes":{"save":"Salvar as opções"},"controls":{"reply":"comece a compor uma resposta para este tópico","like":"curtir esta resposta","has_liked":"você curtiu essa resposta","undo_like":"desfazer curtida","edit":"editar esta resposta","edit_anonymous":"Você precisa estar conectado para editar essa resposta.","flag":"sinalize privativamente esta resposta para chamar atenção ou enviar uma notificação privada sobre ela","delete":"apagar esta resposta","undelete":"recuperar esta resposta","share":"compartilhar o link desta resposta","more":"Mais","delete_replies":{"confirm":{"one":"Você também quer remover a resposta direta a esta resposta?","other":"Você também quer remover as {{count}} respostas diretas a esta resposta?"},"yes_value":"Sim, remover as respostas também","no_value":"Não, somente esta resposta"},"admin":"ações de mensagens do admin","wiki":"Tornar Wiki","unwiki":"Remover Wiki","convert_to_moderator":"Converter para Moderação","revert_to_regular":"Remover da Moderação","rebake":"Reconstruir HTML","unhide":"Revelar","change_owner":"Trocar autor"},"actions":{"flag":"Sinalização","defer_flags":{"one":"Delegar denuncia","other":"Delegar denúncias"},"it_too":{"off_topic":"Sinalizar também","spam":"Sinalizar também","inappropriate":"Sinalizar também","custom_flag":"Sinalizar também","bookmark":"Favoritar também","like":"Curtir também","vote":"Vote neste também"},"undo":{"off_topic":"Desfazer sinalização","spam":"Desfazer sinalização","inappropriate":"Desfazer sinalização","bookmark":"Remover favorito","like":"Descurtir","vote":"Desfazer voto"},"people":{"off_topic":"{{icons}} marcado como off-topic","spam":"{{icons}} marcado como spam","spam_with_url":"{{icons}} marcou \u003ca href='{{postUrl}}'\u003eisto como spam\u003c/a\u003e","inappropriate":"{{icons}} marcado como inapropriado","notify_moderators":"{{icons}} notificaram os moderadores","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003enotificaram os moderadores\u003c/a\u003e","notify_user":"{{icons}} enviou uma mensagem particular","notify_user_with_url":"{{icons}} enviou uma \u003ca href='{{postUrl}}'\u003emensagem particular\u003c/a\u003e","bookmark":"{{icons}} favoritaram isto","like":"{{icons}} curtiram isto","vote":"{{icons}} votaram nisto"},"by_you":{"off_topic":"Você sinalizou isto como off-topic","spam":"Você sinalizou isto como spam","inappropriate":"Você sinalizou isto como inapropriado","notify_moderators":"Você sinalizou isto para a moderação","notify_user":"Você enviou uma mensagem particular para este usuário","bookmark":"Você favoritou esta resposta","like":"Você curtiu","vote":"Você votou nesta resposta"},"by_you_and_others":{"off_topic":{"one":"Você e mais 1 pessoa sinalizaram isto como off-topic","other":"Você e mais {{count}} pessoas sinalizaram isto como off-topic"},"spam":{"one":"Você e mais 1 pessoa sinalizaram isto como spam","other":"Você e mais {{count}} pessoas sinalizaram isto como spam"},"inappropriate":{"one":"Você e mais 1 pessoa sinalizaram isto como inapropriado","other":"Você e mais {{count}} pessoas sinalizaram isto como inapropriado"},"notify_moderators":{"one":"Você e mais 1 pessoa sinalizaram isto para moderação","other":"Você e mais {{count}} pessoas sinalizaram isto para moderação"},"notify_user":{"one":"Você e 1 outro usuário enviaram mensagens particulares para este usuário","other":"Você e mais {{count}} usuários enviaram mensagens particulares para este usuário"},"bookmark":{"one":"Você e mais 1 pessoa favoritaram esta resposta","other":"Você e mais {{count}} favoritaram esta resposta"},"like":{"one":"Você e mais 1 pessoa curtiu isto","other":"Você e mais {{count}} pessoas curtiram isto"},"vote":{"one":"Você e mais 1 pessoa votaram nesta resposta","other":"Você e mais {{count}} pessoas votaram nesta resposta"}},"by_others":{"off_topic":{"one":"1 pessoa sinalizou isto como off-topic","other":"{{count}} pessoas sinalizaram isto como off-topic"},"spam":{"one":"1 pessoa sinalizou isto como spam","other":"{{count}} pessoas sinalizaram isto como spam"},"inappropriate":{"one":"1 pessoa sinalizou isto como inapropriado","other":"{{count}} pessoas sinalizaram isto como inapropriado"},"notify_moderators":{"one":"1 pessoa sinalizou isto para moderação","other":"{{count}} pessoas sinalizaram isto para moderação"},"notify_user":{"one":"1 usuário enviou mensagem particular para este usuário","other":"{{count}} enviaram mensagem particular para este usuário"},"bookmark":{"one":"1 pessoa favoritou esta resposta","other":"{{count}} pessoas favoritaram esta resposta"},"like":{"one":"1 pessoa curtiu","other":"{{count}} pessoas curtiram"},"vote":{"one":"1 pessoa votou nesta resposta","other":"{{count}} pessoas votaram nesta resposta"}}},"delete":{"confirm":{"one":"Tem certeza que quer apagar esta resposta?","other":"Tem certeza que quer apagar todos essas respostas?"}},"revisions":{"controls":{"first":"Primeira revisão","previous":"Revisão anterior","next":"Próxima revisão","last":"Última revisão","hide":"Esconder revisão","show":"Exibir revisão","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Exibir a saída renderizada com adições e remoções em linha","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Exibir as diferentes saídas renderizadas lado a lado","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Mostrar a diferença da fonte crua lado-a-lado","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Cru"}}}},"category":{"can":"pode\u0026hellip; ","none":"(sem categoria)","all":"Todas as categorias","choose":"Selecionar categoria\u0026hellip;","edit":"editar","edit_long":"Editar","view":"Ver tópicos na categoria","general":"Geral","settings":"Configurações","topic_template":"Modelo de Tópico","delete":"Apagar categoria","create":"Nova categoria","create_long":"Criar uma nova categoria","save":"Salvar categoria","slug":"Slug da Categoria","slug_placeholder":"(Opcional) palavras hifenizadas para url","creation_error":"Houve um erro durante a criação da categoria.","save_error":"Houve um erro ao salvar a categoria.","name":"Nome da Categoria","description":"Descrição","topic":"tópico da categoria","logo":"Imagem do logo da categoria","background_image":"Imagem de fundo da categoria","badge_colors":"Badge colors","background_color":"Background color","foreground_color":"Foreground color","name_placeholder":"máximo de uma ou duas palavras","color_placeholder":"Qualquer cor web","delete_confirm":"Tem certeza que quer apagar esta categoria?","delete_error":"Houve um erro ao apagar a categoria.","list":"Lista de categorias","no_description":"Adicione uma descrição para essa categoria.","change_in_category_topic":"Editar Descrição","already_used":"Esta cor já foi usada para outra categoria","security":"Segurança","special_warning":"Atenção: Esta categoria é uma categoria padrão e as configurações de segurança e não podem ser editadas. Se você não quer usar esta categoria, apague-a ao invés de reaproveitá-la.","images":"Imagens","auto_close_label":"Fechar automaticamente tópicos depois de:","auto_close_units":"horas","email_in":"Endereço de e-mail personalizado de entrada:","email_in_allow_strangers":"Aceitar emails de usuários anônimos sem cont","email_in_disabled":"Postar novos tópicos via email está desabilitado nas Configurações do Site. Para habilitar respostas em novos tópicos via email,","email_in_disabled_click":"habilitar a configuração de \"email em\".","suppress_from_homepage":"Suprimir esta categoria da página inicial.","allow_badges_label":"Permitir emblemas serem concedidos nessa categoria","edit_permissions":"Editar Permissões","add_permission":"Adicionar Permissões","this_year":"este ano","position":"posição","default_position":"Posição Padrão","position_disabled":"Categorias serão mostradas em ordem de atividade. Para controlar a ordem das categorias em listas,","position_disabled_click":"habilitar a configuração de \"posição de categoria fixa\".","parent":"Categoria Principal","notifications":{"watching":{"title":"Observar","description":"Você vai acompanhar automaticamente todos os novos tópicos dessas categorias. Você será notificado de todas as novas mensagens em todos tópicos, e uma contagem de novas respostas será mostrada."},"tracking":{"title":"Monitorar","description":"Você vai monitorar automaticamente todos os novos tópicos dessas categorias. Você será notificado se alguém mencionar seu @nome ou te responder, e uma contagem de novas respostas será mostrada."},"regular":{"title":"Normal","description":"Você será notificado se alguém mencionar o seu @nome ou responder à sua mensagem."},"muted":{"title":"Silenciar","description":"Você nunca será notificado sobre novos tópicos nessas categorias, e não aparecerão no Recentes."}}},"flagging":{"title":"Obrigado por ajudar a manter a civilidade da nossa comunidade!","private_reminder":"sinalizações são privadas, \u003cb\u003eapenas\u003c/b\u003e ficam visíveis a moderação","action":"Sinalizar resposta","take_action":"Tomar Atitude","notify_action":"Mensagem","delete_spammer":"Apagar Spammer","delete_confirm":"Você está prestes a excluir \u003cb\u003e%{posts}\u003c/b\u003e mensagens e \u003cb\u003e%{topics}\u003c/b\u003e tópicos deste usuário, removendo a conta, bloqueando cadastro a partir do endereço IP \u003cb\u003e%{ip_address}\u003c/b\u003e e adicionando o e-mail dele \u003cb\u003e%{email}\u003c/b\u003e em uma lista de bloqueio permanente. Você tem certeza que este usuário é realmente um spammer?","yes_delete_spammer":"Sim, Apagar Spammer","ip_address_missing":"(N/D)","hidden_email_address":"(escondido)","submit_tooltip":"Enviar uma sinalização privada","take_action_tooltip":"Atingir o limiar de denuncias imediatamente, ao invés de esperar para mais denuncias da comunidade","cant":"Desculpe, não é possível colocar uma sinalização neste momento.","notify_staff":"Notificar Equipe","formatted_name":{"off_topic":"É Off-Tópico","inappropriate":"É inapropriado","spam":"É spam"},"custom_placeholder_notify_user":"Seja específico, construtivo e sempre seja gentil.","custom_placeholder_notify_moderators":"Deixe-nos saber especificamente com o que você está preocupado, e nos forneça links relevantes e exemplos quando possível.","custom_message":{"at_least":"insira pelo menos {{n}} caracteres","more":"{{n}} em falta...","left":"{{n}} restantes"}},"flagging_topic":{"title":"Obrigado por ajudar a manter a civilidade da nossa comunidade!","action":"Sinalizar Tópico","notify_action":"Mensagem"},"topic_map":{"title":"Resumo do Tópico","participants_title":"Principais Participantes","links_title":"Links Populares","links_shown":"exibir todos os {{totalLinks}} links...","clicks":{"one":"1 clique","other":"%{count} cliques"}},"topic_statuses":{"warning":{"help":"Este é um aviso oficial."},"bookmarked":{"help":"Você adicionou este tópico aos favoritos"},"locked":{"help":"Este tópico está fechado; não serão aceitas mais respostas"},"archived":{"help":"Este tópico está arquivado; está congelado e não pode ser alterado"},"locked_and_archived":{"help":"Este tópico está fechado e arquivado; ele não aceita novas respostas e não pode ser alterado."},"unpinned":{"title":"Não fixo","help":"Este tópico está desfixado para você; ele será mostrado em ordem normal"},"pinned_globally":{"title":"Fixo Globalmente","help":"Este tópico está fixado globalmente; ele será exibido no topo da aba Recentes e no topo da sua categoria"},"pinned":{"title":"Fixo","help":"Este tópico está fixado para você; ele será mostrado no topo de sua categoria"},"invisible":{"help":"Este tópico está invisível; não aparecerá na listagem dos tópicos, e pode apenas ser acessado por link direto"}},"posts":"Mensagens","posts_lowercase":"posts","posts_long":"há {{number}} mensagens neste tópico","original_post":"Resposta original","views":"Visualizações","views_lowercase":{"one":"visualizar","other":"visualizações"},"replies":"Respostas","views_long":"este tópico foi visto {{number}} vezes","activity":"Atividade","likes":"Curtidas","likes_lowercase":{"one":"like","other":"likes"},"likes_long":"há {{number}} curtidas neste tópico","users":"Usuários","users_lowercase":{"one":"usuário","other":"usuários"},"category_title":"Categoria","history":"Histórico","changed_by":"por {{author}}","raw_email":{"title":"Email Raw","not_available":"Não disponível!"},"categories_list":"Lista de categorias","filters":{"with_topics":"%{filter} tópicos","with_category":"%{filter} %{category} tópicos","latest":{"title":"Recente","title_with_count":{"one":"Recente (1)","other":"Recentes ({{count}})"},"help":"tópicos com mensagens recentes"},"hot":{"title":"Quente","help":"uma seleção dos tópicos mais quentes"},"read":{"title":"Lido","help":"tópicos que você leu"},"search":{"title":"Pesquisar","help":"procurar todos tópicos"},"categories":{"title":"Categorias","title_in":"Categoria - {{categoryName}}","help":"todos os tópicos agrupados por categoria"},"unread":{"title":"Não lidas","title_with_count":{"one":"Não lido (1)","other":"Não lidos ({{count}})"},"help":"tópicos que você está acompanhando ou monitorando com mensagens não lidas","lower_title_with_count":{"one":"1 não lido","other":"{{count}} não lidos"}},"new":{"lower_title_with_count":{"one":"1 nova","other":"{{count}} novas"},"lower_title":"nova","title":"Novo","title_with_count":{"one":"Novo (1)","other":"Novos ({{count}})"},"help":"tópicos criados nos últimos dias"},"posted":{"title":"Minhas mensagens","help":"tópicos nos quais você postou"},"bookmarks":{"title":"Favoritos","help":"tópicos que você adicionou aos favoritos"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"},"help":"tópicos recentes na categoria {{categoryName}}"},"top":{"title":"Melhores","help":"os tópicos mais ativos no último ano, mês, semana ou dia","all":{"title":"Tempo Todo"},"yearly":{"title":"Anualmente"},"quarterly":{"title":"Trimestralmente"},"monthly":{"title":"Mensalmente"},"weekly":{"title":"Semanalmente"},"daily":{"title":"Diariamente"},"all_time":"Tempo Todo","this_year":"Ano","this_quarter":"Trimestre","this_month":"Mês","this_week":"Semana","today":"Hoje","other_periods":"Veja o topo"}},"browser_update":"Infelizmente, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eseu navegador é muito antigo para ser utilizado neste site\u003c/a\u003e. Por favor \u003ca href=\"http://browsehappy.com\"\u003eatualize seu navegador\u003c/a\u003e.","permission_types":{"full":"Criar / Responder / Ver","create_post":"Responder / Ver","readonly":"Ver"},"poll":{"voters":{"one":"votante","other":"votantes"},"total_votes":{"one":"voto total","other":"votos totais"},"average_rating":"Resultado médio: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"Você deve escolher pelo menos \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Você deve escolher pelo menos \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"up_to_max_options":{"one":"Você deve escolher até \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Você deve escolher até \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"x_options":{"one":"Você deve escolher \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Você deve escolher \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"between_min_and_max_options":"Você pode escolher entre \u003cstrong\u003e%{min}\u003c/strong\u003e e \u003cstrong\u003e%{max}\u003c/strong\u003e opções."}},"cast-votes":{"title":"Seus votos","label":"Votar agora!"},"show-results":{"title":"Mostrar o resultado da enquete","label":"Mostrar resultados"},"hide-results":{"title":"Voltar para os seus votos","label":"Esconder resultados"},"open":{"title":"Abrir a enquete","label":"Abrir","confirm":"Você tem certeza que deseja abrir essa enquete?"},"close":{"title":"Fechar a enquete","label":"Fechar","confirm":"Você tem certeza que deseja fechar essa enquete?"},"error_while_toggling_status":"Houve um erro ao alternar o status dessa enquete.","error_while_casting_votes":"Houve um erro ao coletar seus votos."},"type_to_filter":"escreva para filtrar...","admin":{"title":"Discourse Admin","moderator":"Moderador","dashboard":{"title":"Painel Administrativo","last_updated":"Painel atualizado em:","version":"Versão","up_to_date":"Você está atualizado!","critical_available":"Uma atualização crítica está disponível.","updates_available":"Atualizações estão disponíveis.","please_upgrade":"Por favor atualize!","no_check_performed":"Não foi feita verificação por atualizações. Certifique-se de sidekiq esta em execucao.","stale_data":"Não foi feita verificação por atualizações ultimamente. Certifique-se de sidekiq esta em execucao.","version_check_pending":"Parece que você atualizou recentemente. Fantástico!","installed_version":"Instalado","latest_version":"Última versão","problems_found":"Alguns problemas foram encontrados na sua instalação do Discourse:","last_checked":"Última verificação","refresh_problems":"Atualizar","no_problems":"Nenhum problema encontrado.","moderators":"Moderadores:","admins":"Admins:","blocked":"Bloqueado:","suspended":"Suspenso:","private_messages_short":"Msgs","private_messages_title":"Mensagens","mobile_title":"Mobile","space_free":"{{size}} livre","uploads":"uploads","backups":"backups","traffic_short":"Tráfego","traffic":"Solicitações do aplicativo pela web","page_views":"Solicitações de API","page_views_short":"Solicitações de API","show_traffic_report":"Mostrar Relatório de Tráfego Detalhado","reports":{"today":"Hoje","yesterday":"Ontem","last_7_days":"Últimos 7 Dias","last_30_days":"Últimos 30 Dias","all_time":"Todo Tempo","7_days_ago":"7 Dias Atrás","30_days_ago":"30 Dias Atrás","all":"Tudo","view_table":"tabela","view_chart":"Gráfico de barras","refresh_report":"Atualizar Relatório","start_date":"Data de Início","end_date":"Data do Final"}},"commits":{"latest_changes":"Últimas atualizações: atualize com frequência!","by":"por"},"flags":{"title":"Sinalizações","old":"Antigo","active":"Ativo","agree":"Concordo","agree_title":"Confirmar esta marcação como válida e correta","agree_flag_modal_title":"Concordar e...","agree_flag_hide_post":"Aceitar (esconder post + enviar MP)","agree_flag_hide_post_title":"Esconder este post e enviar automaticamente uma mensagem particular para o usuário solicitando que ele edite este post urgentemente","agree_flag_restore_post":"Concordar (restaurar post)","agree_flag_restore_post_title":"Restaurar este post","agree_flag":"Concordar com a marcação","agree_flag_title":"Concordar com a marcação e manter o post inalterado","defer_flag":"Delegar","defer_flag_title":"Remover esta marcação; ela não requer nenhuma ação neste momento.","delete":"Apagar","delete_title":"Apagar o post ao qual a marcação se refere.","delete_post_defer_flag":"Apagar o post e postergar a marcação","delete_post_defer_flag_title":"Apaga a resposta; se for a primeira, apagar o tópico","delete_post_agree_flag":"Deletar o post e Concordar com a marcação","delete_post_agree_flag_title":"Apagar resposta; se for a primeira, deletar o tópico","delete_flag_modal_title":"Apagar e ...","delete_spammer":"Deletar Spammer","delete_spammer_title":"Remover o usuário e todas as suas respostas e tópicos.","disagree_flag_unhide_post":"Discordar (reexibir resposta)","disagree_flag_unhide_post_title":"Remover qualquer denúncia dessa resposta e fazer ela visível de novo","disagree_flag":"Discordar","disagree_flag_title":"Negar a marcação como inválida ou incorreta","clear_topic_flags":"Concluído","clear_topic_flags_title":"O tópico foi investigado e as questões foram resolvidas. Clique em Concluído para remover as sinalizações.","more":"(mais respostas...)","dispositions":{"agreed":"concordar","disagreed":"discordar","deferred":"deferida"},"flagged_by":"Sinalizado por","resolved_by":"Resolvido por","took_action":"Tomar ação","system":"Sistema","error":"Algo deu errado","reply_message":"Responder","no_results":"Não há sinalizações.","topic_flagged":"Este \u003cstrong\u003etópico\u003c/strong\u003e foi sinalizado.","visit_topic":"Visitar o tópico para tomar ações","was_edited":"Resposta foi editada após uma primeira sinalização","previous_flags_count":"Este post já foi marcado {{count}} vezes.","summary":{"action_type_3":{"one":"off-topic","other":"off-topic x{{count}}"},"action_type_4":{"one":"inapropriado","other":"inapropriado x{{count}}"},"action_type_6":{"one":"customizado","other":"customizados x{{count}}"},"action_type_7":{"one":"personalizado","other":"personalizado x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Grupo Primário","no_primary":"(sem grupo primário)","title":"Grupos","edit":"Editar Grupos","refresh":"Atualizar","new":"Novo","selector_placeholder":"digite o nome de usuário","name_placeholder":"Nome do grupo, sem espaços, regras iguais ao nome de usuário","about":"Editar participação no grupo e nomes aqui","group_members":"Membros do grupo","delete":"Apagar","delete_confirm":"Apagar este grupos?","delete_failed":"Unable to delete group. If this is an automatic group, it cannot be destroyed.","delete_member_confirm":"Remover '%{username}' do grupo '%{group}'?","delete_owner_confirm":"Remover privilégio de proprietário de '%{username}'?","name":"Nome","add":"Adicionar","add_members":"Adicionar membros","custom":"Definidos","bulk_complete":"Os usuários foram adicionados ao grupo.","bulk_paste":"Cole uma lista de usernames ou emails, um por linha:","bulk_select":"(selecione um grupo)","automatic":"Automático","automatic_membership_email_domains":"Usuários que se registram com um domínio de email que confere precisamente com algum desta lista serão automaticamente adicionados a este grupo:","automatic_membership_retroactive":"Aplicar a mesma regra de domínio de email para adicionar usuários registrados","default_title":"Título padrão para todos usuários nesse grupo","primary_group":"Configurar automaticamente como grupo primário","group_owners":"Prorietários","add_owners":"Adicionar proprietários"},"api":{"generate_master":"Gerar chave Mestra de API","none":"Não existem chaves API ativas no momento.","user":"Usuário","title":"API","key":"Chave API","generate":"Gerar","regenerate":"Regenerar","revoke":"Revogar","confirm_regen":"Tem a certeza que quer substituir esta chave API por uma nova?","confirm_revoke":"Tem a certeza que quer revogar essa chave?","info_html":"Sua chave de API permitirá a criação e edição de tópicos usando requests JSON.","all_users":"Todos os Usuários","note_html":"Guarde esta chave \u003cstrong\u003esecretamente\u003c/strong\u003e, todos usuários que tiverem acesso a ela poderão criar posts arbritários no forum como qualquer usuário."},"plugins":{"title":"Plugins","installed":"Plugins Instalados","name":"Nome","none_installed":"Você não tem quaisquer plugins instalados.","version":"Versão","enabled":"Habilitado?","is_enabled":"S","not_enabled":"N","change_settings":"Mudar Configurações","change_settings_short":"Configurações","howto":"Como eu instalo plugins?"},"backups":{"title":"Backups","menu":{"backups":"Backups","logs":"Registros"},"none":"Nenhum backup disponível.","read_only":{"enable":{"title":"Habilitar o modo \"somente leitura\"","label":"Habilita modo \"somente leitura\"","confirm":"Você está certo em querer habilitar o modo \"somente leitura\"?"},"disable":{"title":"Desabilitar o modo \"somente leitura\"","label":"Desabilita modo \"somente leitura\""}},"logs":{"none":"Nenhum registro ainda..."},"columns":{"filename":"Nome do arquivo","size":"Tamanho"},"upload":{"label":"Enviar","title":"Carregar um backup para esta instância","uploading":"Subindo...","success":"'{{filename}}' foi carregado com sucesso.","error":"Houve um erro ao carregar '{{filename}}': {{message}}"},"operations":{"is_running":"Uma operação está sendo executada...","failed":"A {{operation}} falhou. Por favor, cheque os registros.","cancel":{"label":"Cancelar","title":"Cancelar a operação atual","confirm":"Tem certeza de que deseja cancelar a operação atual?"},"backup":{"label":"Backup","title":"Cria um backup","confirm":"Você quer iniciar um novo backup?","without_uploads":"Sim (não inclua arquivos)"},"download":{"label":"Download","title":"Download do backup"},"destroy":{"title":"Remove o backup","confirm":"Tem certeza de que quer destruir este backup?"},"restore":{"is_disabled":"Restaurar está desativado nas configurações do site.","label":"Restaurar","title":"Restaurar o backup","confirm":"Tem certeza de que quer restaurar este backup?"},"rollback":{"label":"Reverter","title":"Reverter o banco de dados para seu estado anterior","confirm":"Tem certeza de que quer reverter o banco de dados para o estado anterior?"}}},"export_csv":{"user_archive_confirm":"Tem certeza que você quer baixar os seus tópicos?","success":"Exportação iniciada, você será notificado por mensagem particular quando o processo estiver completo.","failed":"Falha na exportação. Por favor verifique os logs.","rate_limit_error":"O download de posts pode ser feito apenas uma vez por dia, por favor, tente novamente amanhã.","button_text":"Exportar","button_title":{"user":"Exportar lista de usuários completa em formato CSV.","staff_action":"Exportar log completo de atividades da staff em formato CSV.","screened_email":"Exportar lista completa de emails filtrados em formato CSV.","screened_ip":"Exportar lista completa de IPs filtrados em formato CSV.","screened_url":"Exportar lista completa de URLs filtradas em formato CSV."}},"export_json":{"button_text":"Exportar"},"invite":{"button_text":"Enviar Convites","button_title":"Enviar Convites"},"customize":{"title":"Personalizar","long_title":"Personalizações do Site","css":"CSS","header":"Cabeçalho","top":"Superior","footer":"Rodapé","embedded_css":"CSS Incorporada","head_tag":{"text":"\u003c/head\u003e","title":"HTML que será inserido antes da tag \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML que será inserido antes da tag \u003c/body\u003e"},"override_default":"Sobrepor padrão?","enabled":"Habilitado?","preview":"pré-visualização","undo_preview":"remover preview","rescue_preview":"estilo padrão","explain_preview":"Ver o site com o estilo personalizado","explain_undo_preview":"Voltar para o estilo personalizado atual","explain_rescue_preview":"Ver o site com o estilo padrão","save":"Guardar","new":"Novo","new_style":"Novo Estilo","import":"Importar","import_title":"Selecione um arquivo ou cole texto","delete":"Apagar","delete_confirm":"Apagar esta personalização?","about":"Modificar o CSS e HTML do cabeçalho do site. Adicione uma customização para começar.","color":"Cor","opacity":"Opacidade","copy":"Copiar","email_templates":{"title":"Modelos de E-mail","subject":"Assunto","body":"Corpo","none_selected":"Selecione um modelo de e-mail para iniciar a edição.","revert":"Reverter Alterações","revert_confirm":"Tem certeza de que deseja reverter as alterações?"},"css_html":{"title":"CSS/HTML","long_title":"Customizações CSS e HTML"},"colors":{"title":"Cores","long_title":"Esquema de Cores","about":"Modifique as cores usadas no site sem escrever CSS. Adicione um esquema para começar.","new_name":"Novo Esquema de Cor","copy_name_prefix":"Copiar de","delete_confirm":"Apagar esse esquema de cor?","undo":"desfazer","undo_title":"Desfazer suas mudanças para esta cor desde a última vez que foi salvo.","revert":"reverter","revert_title":"Apagar esta cor do projeto padrão de cores do Discourse.","primary":{"name":"primário","description":"Maioria dos textos, ícones e bordas."},"secondary":{"name":"secundário","description":"A cor de fundo principal e o texto de alguns botões."},"tertiary":{"name":"terciário","description":"Links, alguns botões, notificações e cor realçada."},"quaternary":{"name":"quaternário","description":"Links de navegação."},"header_background":{"name":"fundo do cabeçalho","description":"Cor de fundo do cabeçalho do site."},"header_primary":{"name":"cabeçalho: primário","description":"Texto e ícones no cabeçalho do site."},"highlight":{"name":"destaque","description":"A cor de fundo dos elementos em destaque na página, como mensagens e tópicos."},"danger":{"name":"perigo","description":"Cor de destaque para ações como remover mensagens e tópicos."},"success":{"name":"sucesso","description":"Usado para indicar que a ação foi bem sucedida."},"love":{"name":"curtir","description":"A cor do botão curtir."},"wiki":{"name":"wiki","description":"Cor base usada para o fundo em postagens do wiki."}}},"email":{"title":"Email","settings":"Settings","all":"Todas","sending_test":"Enviando e-mail de teste...","error":"\u003cb\u003eERRO\u003c/b\u003e - %{server_error}","test_error":"Houve um problema ao enviar o email de teste. Por favor, verifique as configurações de email, se o seu provedor não está bloqueando conexões de email e tente novamente.","sent":"Enviado","skipped":"Ignorado","sent_at":"Enviado para ","time":"Hora","user":"Usuário","email_type":"Tipo de Email","to_address":"Para (endereço)","test_email_address":"endereço de email para testar","send_test":"Enviar email de teste","sent_test":"enviado!","delivery_method":"Delivery Method","preview_digest":"Preview Digest","preview_digest_desc":"Pré-visualizar o conteúdo do e-mail de resumo enviado para usuários inativos.","refresh":"Atualizar","format":"Formato","html":"html","text":"texto","last_seen_user":"Último Usuário Visto:","reply_key":"Chave de Resposta","skipped_reason":"Ignorar Motivo","logs":{"none":"Nenhum registro encontrado.","filters":{"title":"Filtro","user_placeholder":"Nome de usuário","address_placeholder":"nome@exemplo.com","type_placeholder":"resenha, cadastro...","reply_key_placeholder":"tecla de resposta","skipped_reason_placeholder":"motivo"}}},"logs":{"title":"Logs","action":"Ação","created_at":"Criado","last_match_at":"Última Correspondência","match_count":"Resultados","ip_address":"IP","topic_id":"ID do Tópico","post_id":"ID Mensagem","category_id":"ID da Categoria","delete":"Excluir","edit":"Editar","save":"Salvar","screened_actions":{"block":"bloquear","do_nothing":"não fazer nada"},"staff_actions":{"title":"Ações do Staff","instructions":"Clique nos nomes de usuário e ações para filtrar a lista. Clique nas imagens de perfil para ir para as páginas de usuário.","clear_filters":"Mostrar Tudo","staff_user":"Usuário do Staff","target_user":"Usuário Destino","subject":"Assunto","when":"Quando","context":"Contexto","details":"Detalhes","previous_value":"Anterior","new_value":"Nova","diff":"Diferenças","show":"Exibir","modal_title":"Detalhes","no_previous":"Não há valor anterior.","deleted":"Não há valor novo. O registro foi removido.","actions":{"delete_user":"removeu usuário","change_trust_level":"modificou nível de confiança","change_username":"mudar nome de usuário","change_site_setting":"alterar configurações do site","change_site_customization":"alterar personalização do site","delete_site_customization":"remover personalização do site","suspend_user":"suspender usuário","unsuspend_user":"readmitir usuário","grant_badge":"conceder emblema","revoke_badge":"revogar emblema","check_email":"checar email","delete_topic":"apagar tópico","delete_post":"apagar mensagem","impersonate":"personificar","anonymize_user":"tornar usuário anônimo","roll_up":"Agrupar bloco de IP","change_category_settings":"mudas configurações da categoria","delete_category":"apagar a categoria","create_category":"criar uma categoria"}},"screened_emails":{"title":"Emails Filtrados","description":"Quando alguém tenta cria uma nova conta, os seguintes endereços de email serão verificados e o registro será bloqueado, ou outra ação será executada.","email":"Endereço de Email","actions":{"allow":"Permitido"}},"screened_urls":{"title":"URLs Filtradas","description":"As URLs listadas aqui foram usadas em mensagens de usuários que foram identificados como spammers.","url":"URL","domain":"Domínio"},"screened_ips":{"title":"IPs Filtrados","description":"Endereços IP que estão sendo acompanhados. Use \"Permitir\" para confiar em endereços IP.","delete_confirm":"Tem certeza que deseja remover a regra para %{ip_address}?","roll_up_confirm":"Tem certeza que deseja combinar endereços IP filtrados comuns em subnets?","rolled_up_some_subnets":"Entradas de IP banidos combinadas nestas subnets: %{subnets}.","rolled_up_no_subnet":"Não havia nada a combinar.","actions":{"block":"Bloquear","do_nothing":"Permitido","allow_admin":"Permitir Admin"},"form":{"label":"Novo:","ip_address":"Endereço IP","add":"Adicionar","filter":"Pesquisar"},"roll_up":{"text":"Combinar","title":"Cria novas entradas de banimento por subnet caso existam no mínimo 'min_ban_entries_for_roll_up' entradas."}},"logster":{"title":"Registro de erros"}},"impersonate":{"title":"Personificar","help":"Utilize esta ferramenta para personificar uma conta de usuário para efeitos de depuração. Você terá que sair dela assim que terminar.","not_found":"Esse usuário não pode ser encontrado.","invalid":"Desculpe, não é possível personificar esse usuário."},"users":{"title":"Usuários","create":"Adicionar Usuário Admin","last_emailed":"Último email enviado","not_found":"Desculpe, esse nome de usuário não existe no nosso sistema.","id_not_found":"Desculpe, esse nome de usuário não existe no nosso sistema.","active":"Ativo","show_emails":"Mostrar Emails","nav":{"new":"Novos","active":"Ativos","pending":"Pendentes","staff":"Equipe","suspended":"Suspenso","blocked":"Bloqueados","suspect":"Suspeito"},"approved":"Aprovado?","approved_selected":{"one":"aprovar usuário","other":"aprovar usuários ({{count}})"},"reject_selected":{"one":"rejeitar usuário","other":"rejeitar usuários ({{count}})"},"titles":{"active":"Usuários Ativos","new":"Usuários Novos","pending":"Usuários com Confirmação Pendente","newuser":"Usuários no Nível de Confiança 0 (Usuário Novo)","basic":"Usuários no Nível de Confiança 1 (Usuário Básico)","member":"Usuário em Nível de Confiança 2 (Membro)","regular":"Usuário em Nível de Confiança 3 (Regular)","leader":"Usuário em Nível de Confiança 4 (Líder)","staff":"Equipe de apoio","admins":"Usuários Administradores","moderators":"Moderadores","blocked":"Usuários Boqueados","suspended":"Usuários Suspensos","suspect":"Usuários suspeitos"},"reject_successful":{"one":"1 usuário foi rejeitado com sucesso.","other":"%{count} usuários foram rejeitados com sucesso."},"reject_failures":{"one":"Falha ao rejeitar 1 usuário.","other":"Falha ao rejeitar %{count} usuários."},"not_verified":"Não verificado","check_email":{"title":"Mostrar endereço de email deste usuário","text":"Mostrar"}},"user":{"suspend_failed":"Algo deu errado suspendendo este usuário {{error}}","unsuspend_failed":"Algo deu errado reativando este usuário {{error}}","suspend_duration":"Por quanto tempo o usuário deverá ser suspenso?","suspend_duration_units":"(dias)","suspend_reason_label":"Por que você está suspendendo? Esse texto \u003cb\u003eserá visível para todos\u003c/b\u003e na página de perfil desse usuário, e será mostrado ao usuário quando ele tentar se logar. Seja breve.","suspend_reason":"Motivo","suspended_by":"Suspenso por","delete_all_posts":"Apagar todas mensagens","delete_all_posts_confirm":"Você está prestes a apagar %{posts} mensagens e %{topics} tópicos. Tem certeza que quer continuar?","suspend":"Suspender","unsuspend":"Readmitir","suspended":"Suspenso?","moderator":"Moderador?","admin":"Admin?","blocked":"Bloqueado?","show_admin_profile":"Admin","edit_title":"Editar Título","save_title":"Salvar Título","refresh_browsers":"Forçar atualização da página no browser","refresh_browsers_message":"Mensagem enviada para todos os clientes!","show_public_profile":"Mostrar Perfil Público","impersonate":"Personificar","ip_lookup":"Pesquisa do IP","log_out":"Log Out","logged_out":"Usuário foi desconectado em todos os dipositivos","revoke_admin":"Revogar Admin","grant_admin":"Conceder Admin","revoke_moderation":"Revogar Moderação","grant_moderation":"Conceder Moderação","unblock":"Desbloquear","block":"Bloquear","reputation":"Reputação","permissions":"Permissões","activity":"Atividade","like_count":"Curtidas dados / recebidos","last_100_days":"nos últimos 100 dias","private_topics_count":"Tópicos Privados","posts_read_count":"Mensagens lidas","post_count":"Mensagens criadas","topics_entered":"Tópicos Vistos","flags_given_count":"Sinalizações dadas","flags_received_count":"Sinalizações recebidas","warnings_received_count":"Avisos Recebidos","flags_given_received_count":"Sinalizações dados / recebidos","approve":"Aprovar","approved_by":"aprovado por","approve_success":"Usuário aprovado e email enviado com instruções de ativação.","approve_bulk_success":"Sucesso! Todos os usuários selecionados foram aprovados e notificados.","time_read":"Tempo de leitura","anonymize":"Tornar usuário anônimo","anonymize_confirm":"Você TEM CERTEZA que gostaria de tornar esta conta anônima? Esta mudança irá alterar o nome de usuário e email, e resetar todas informações do perfil.","anonymize_yes":"Sim, tornar esta conta anônima","anonymize_failed":"Ocorreu um problema ao tornar a conta anônima.","delete":"Apagar Usuário","delete_forbidden_because_staff":"Administradores e moderadores não podem ser excluidos.","delete_posts_forbidden_because_staff":"Não posso deletar todas as mensagens de administradores e moderadores.","delete_forbidden":{"one":"Usuários não podem ser excluídos se eles têm mensagens. Excluir todas as mensagens antes de tentar excluir um usuário. (Mensagens mais antigas que %{count} dia não podem ser excluídas.)","other":"Usuários não podem ser excluídos se eles têm mensagens. Remova todas as mensagens antes de tentar excluir um usuário. (Mensagens mais antigas que %{count} dias não podem ser excluídas.)"},"cant_delete_all_posts":{"one":"Não é possível excluir todas as mensagens. Algumas mensagens são mais antigas do que %{count} dia. (Configuração delete_user_max_post_age.)","other":"Não é possível remover todas as mensagens. Algumas mensagens são mais antigas do que %{count} dias. (Configuração delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Não pode remover porque o usuário tem mais de uma mensagem (delete_all_posts_max)","other":"Não pode remover porque o usuário tem mais de %{count} mensagens. (delete_all_posts_max)"},"delete_confirm":"Você tem CERTEZA de que quer deletar este usuário? Isto é permanente!","delete_and_block":"Deletar e \u003cb\u003ebloquear\u003c/b\u003e este email e endereço IP","delete_dont_block":"Apagar apenas","deleted":"O usuário foi apagado.","delete_failed":"Houve um erro ao apagar o usuário. Certifique-se de que todas mensagens dele foram apagadas antes de tentar apagá-lo.","send_activation_email":"Enviar Email de Ativação","activation_email_sent":"Um email de ativação foi enviado.","send_activation_email_failed":"Houve um problema ao enviar um novo email de ativação. %{error}","activate":"Ativar Conta","activate_failed":"Houve um problema ao tornar o usuário ativo.","deactivate_account":"Desativar Conta","deactivate_failed":"Houve um problema ao desativar o usuário.","unblock_failed":"Houve um problema ao desbloquear o usuário.","block_failed":"Houve um problema ao bloquear o usuário.","deactivate_explanation":"Um usuário desativado deve revalidar seu email.","suspended_explanation":"Um usuário suspenso não pode entrar.","block_explanation":"Um usuário bloqueado não pode postar ou iniciar tópicos.","trust_level_change_failed":"Houve um problema ao trocar o nível de confiança do usuário.","suspend_modal_title":"Usuário Suspenso","trust_level_2_users":"Usuários de Nível de Confiança 2","trust_level_3_requirements":"Requisitos do Nível de Confiança 3","trust_level_locked_tip":"nível de confiança está travado, sistema não irá promover ou demover o usuário","trust_level_unlocked_tip":"nível de confiança está destravado, sistema poderá promover ou demover o usuário","lock_trust_level":"Travar Nível de Confiança","unlock_trust_level":"Destravar Nível de Confiança","tl3_requirements":{"title":"Requisitos para o Nível de Confiança 3","table_title":"Nos últimos 100 dias:","value_heading":"Valor","requirement_heading":"Requisito","visits":"Visitas","days":"dias","topics_replied_to":"Tópicos Respondidos","topics_viewed":"Tópicos Visualizados","topics_viewed_all_time":"Tópicos vistos (todos os tempos)","posts_read":"Posts Lidos","posts_read_all_time":"Posts Lidos (todo o período)","flagged_posts":"Mensagens Sinalizadas","flagged_by_users":"Usuários que foram denunciados","likes_given":"Curtidas dados","likes_received":"Curtidas recebidos","likes_received_days":"Curtidas recebidas: dias únicos","likes_received_users":"Curtidas recebidas: usuários únicos","qualifies":"Qualificado para o nível 3 de confiança.","does_not_qualify":"Não qualificado para o nível 3 de confiança.","will_be_promoted":"Será promovido em breve.","will_be_demoted":"Será demovido em breve.","on_grace_period":"Atualmente em período de aprovação da promoção, não será demovido.","locked_will_not_be_promoted":"Nível de confiança travado. Nunca será promovido.","locked_will_not_be_demoted":"Nível de confiança travado. Nunca será demovido."},"sso":{"title":"Único Login","external_id":"ID Externo","external_username":"Usuário","external_name":"Nome","external_email":"Email","external_avatar_url":"URL da Imagem de Perfil"}},"user_fields":{"title":"Campos de Usuários","help":"Adicionar campos que seus usuários podem preencher.","create":"Criar Campo de Usuário","untitled":"Sem título","name":"Nome do Campo","type":"Tipo do Campo","description":"Descrição do Campo","save":"Salvar","edit":"Editar","delete":"Apagar","cancel":"Cancelar","delete_confirm":"Tem certeza que quer apagar este campo de usuário?","options":"Opções","required":{"title":"Necessário para cadastro?","enabled":"necessário","disabled":"não necessário"},"editable":{"title":"Editável após criar conta?","enabled":"editável","disabled":"não editável"},"show_on_profile":{"title":"Mostrar no perfil público?","enabled":"mostrado no perfil","disabled":"não mostrado no perfil"},"field_types":{"text":"Campo Texto","confirm":"Confirmação","dropdown":"Caixa de seleção"}},"site_text":{"none":"Escolha um tipo de conteúdo para começar a editar.","title":"Conteúdo do Texto"},"site_settings":{"show_overriden":"Exibir apenas valores alterados","title":"Configurações","reset":"apagar","none":"nenhum","no_results":"Nenhum resultado encontrado.","clear_filter":"Limpar","add_url":"adicionar URL","add_host":"adicionar host","categories":{"all_results":"Todas","required":"Requerido","basic":"Configuração Básica","users":"Usuários","posting":"Publicando","email":"E-mail","files":"Arquivos","trust":"Níveis de Confiança","security":"Segurança","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Taxa de Limites","developer":"Desenvolvedor","embedding":"Incorporação","legal":"Jurídico","uncategorized":"Outros","backups":"Backups","login":"Entrar","plugins":"Plugins","user_preferences":"Preferências de Usuário"}},"badges":{"title":"Emblemas","new_badge":"Novo Emblema","new":"Novo","name":"Nome","badge":"Emblema","display_name":"Nome de Exibição","description":"Descrição","badge_type":"Tipo de Emblema","badge_grouping":"Grupo","badge_groupings":{"modal_title":"Agrupamentos de emblemas"},"granted_by":"Concedido Por","granted_at":"Concedido Em","reason_help":"(Um link para um post ou tópico)","save":"Salvar","delete":"Remover","delete_confirm":"Tem certeza de que deseja remover este emblema?","revoke":"Revogar","reason":"Motivo","expand":"Expandir \u0026hellip;","revoke_confirm":"Tem certeza de que deseja revogar este emblema?","edit_badges":"Editar Emblemas","grant_badge":"Conceder Emblema","granted_badges":"Emblemas Concedidos","grant":"Conceder","no_user_badges":"%{name} não teve nenhum emblema concedido.","no_badges":"Não há emblemas que podem ser concedidos.","none_selected":"Selecione um emblema para começar","allow_title":"Permitir ao emblema ser usado como título","multiple_grant":"Pode ser concedido várias vezes","listable":"Mostrar emblema na página pública de emblemas","enabled":"Habilitar emblema","icon":"Ícone","image":"Imagem","icon_help":"Use uma classe do Font Awesome ou uma URL de uma imagem","query":"Badge Query (SQL)","target_posts":"Consultar respostas selecionadas","auto_revoke":"Rodar revocation query todo dia","show_posts":"Mostrar as concessões de emblemas na página de emblemas","trigger":"Trigger","trigger_type":{"none":"Atualizado diariamente","post_action":"Quando um usuário age em uma resposta","post_revision":"Quando um usuário edita ou cria uma resposta","trust_level_change":"Quando um usuário muda seu nível de confiança","user_change":"Quando um usuário é editado ou criado"},"preview":{"link_text":"Prever medalhas concedidas","plan_text":"Prever com plano de busca","modal_title":"Preview da Busca de Medalhas","sql_error_header":"Houve um erro com a busca.","error_help":"Veja os seguintes links para ajuda com consulta de emblemas.","bad_count_warning":{"header":"CUIDADO!","text":"Faltam amostras de concessão. Isso acontece quando a consulta de emblemas retorna IDs de usuários ou IDs de postagens que não existem. Isso pode causar resultados inesperados futuramente - por favor verifique novamente a sua consulta."},"no_grant_count":"Sem emblemas para serem atribuídos.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e emblema para ser atribuído.","other":"\u003cb\u003e%{count}\u003c/b\u003e emblemas para serem atribuídos."},"sample":"Exemplo:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e por postar em %{link} às \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e às \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Adicionar novo emoji que estará disponível para todos. (DICA: arraste \u0026 solte diversos arquivos de uma vez)","add":"Adicionar Novo Emoji","name":"Nome","image":"Imagem","delete_confirm":"Tem certeza que deseja excluir o emoji :%{name}: ?"},"embedding":{"get_started":"Se você deseja incorporar Discourse em outro site, começe adicionando seu host.","confirm_delete":"Você tem certeza que deseja apagar este host?","sample":"Use o seguinte código HTML no seu site para criar e incorporar tópicos do Discourse. Troque \u003cb\u003eREPLACE_ME\u003c/b\u003e com a URL canônica da página na qual você está incorporando.","title":"Incorporar","host":"Hosts Permitidos","edit":"editar","category":"Postar na Categoria","add_host":"Adicionar Host","settings":"Configurações de Incorporação","feed_settings":"Configurações de Feed","feed_description":"Prover um feed de RSS/ATOM de seu site pode melhorar a habilidade do Discourse para importar seu conteúdo.","crawling_settings":"Configurações de Crawler","crawling_description":"Quando Discourse cria tópicos para suas postagens, se nenhum feed RSS/ATOM estiver presente ele tentar recuperar o conteúdo do seu HTML. Algumas vezes isso pode sem um desafio, então provemos a habilidade de prover as regras específicas de CSS para fazer a extração mais fácil.","embed_by_username":"Nome de usuário para criação do tópico","embed_post_limit":"Número máximo de postagens para incorporar","embed_username_key_from_feed":"Chave para obter o nome de usuário no discourse do feed","embed_truncate":"Truncar as postagens incorporadas","embed_whitelist_selector":"Seletor de CSS para elementos que são permitidos na incorporação","embed_blacklist_selector":"Seletor de CSS para elementos que são removidos da incorporação","feed_polling_enabled":"Importar postagens via RSS/ATOM","feed_polling_url":"URL do feed RSS/ATOM para pesquisar","save":"Salvar Configurações de Incorporação"},"permalink":{"title":"Links permanentes","url":"URL","topic_id":"ID do Tópico","topic_title":"Tópico","post_id":"ID da Mensagem","post_title":"Mensagem","category_id":"ID da Categoria","category_title":"Categoria","external_url":"URL externa","delete_confirm":"Você tem certeza que quer apagar esse link permanente?","form":{"label":"Novo:","add":"Adicionar","filter":"Busca (URL ou URL Externa)"}}},"lightbox":{"download":"download"},"search_help":{"title":"Procurar na Ajuda"},"keyboard_shortcuts_help":{"title":"Atalhos de teclado","jump_to":{"title":"Ir Para","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Home","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Últimos","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Novo","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Não Lidos","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Categorias","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Topo","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Favoritos","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Perfil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mensagens"},"navigation":{"title":"Navegação","jump":"\u003cb\u003e#\u003c/b\u003e Ir para a resposta #","back":"\u003cb\u003eu\u003c/b\u003e Voltar","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Move seleção \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e ou \u003cb\u003eEnter\u003c/b\u003e Abre tópico selecionado","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Pŕoxima seção/seção anterior"},"application":{"title":"Aplicação","create":"\u003cb\u003ec\u003c/b\u003e Criar um tópico novo","notifications":"\u003cb\u003en\u003c/b\u003e Abre notificações","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Abrir menu hamburger","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Abrir menu do usuário","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Exibir tópicos atualizados","search":"\u003cb\u003e/\u003c/b\u003e Pesquisa","help":"\u003cb\u003e?\u003c/b\u003e Abrir ajuda de teclado","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Descartar Novas Postagens","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Descartar Tópicos","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Deslogar"},"actions":{"title":"Ações","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Adicionar tópico aos favoritos","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Fixar/Desfixar tópico","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Compartilhar tópico","share_post":"\u003cb\u003es\u003c/b\u003e Compartilhar mensagem","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Responder como tópico linkado","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Responder ao tópico","reply_post":"\u003cb\u003er\u003c/b\u003e Responder a mensagem","quote_post":"\u003cb\u003eq\u003c/b\u003e Citar resposta","like":"\u003cb\u003el\u003c/b\u003e Curtir a mensagem","flag":"\u003cb\u003e!\u003c/b\u003e Sinalizar mensagem","bookmark":"\u003cb\u003eb\u003c/b\u003e Marcar mensagem","edit":"\u003cb\u003ee\u003c/b\u003e Editar mensagem","delete":"\u003cb\u003ed\u003c/b\u003e Excluir mensagem","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Silenciar tópico","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Tópico (default) normal","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Monitorar tópico","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Acompanhar tópico"}},"badges":{"title":"Emblemas","allow_title":"pode  ser usado como um título","multiple_grant":"pode ser recebido várias vezes","badge_count":{"one":"1 Emblema","other":"%{count} Emblemas"},"more_badges":{"one":"+1 Mais","other":"+%{count} Mais"},"granted":{"one":"1 emblema concedido","other":"%{count} emblemas concedidos"},"select_badge_for_title":"Selecione um emblema para usar como título","none":"\u003cnenhum\u003e","badge_grouping":{"getting_started":{"name":"Começando"},"community":{"name":"Comunidade"},"trust_level":{"name":"Nível de confiança"},"other":{"name":"Outro"},"posting":{"name":"Postando"}},"badge":{"editor":{"name":"Editor","description":"Primeira edição da resposta"},"basic_user":{"name":"Básico","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eConcedido\u003c/a\u003e todas as funções essenciais da comunidade"},"member":{"name":"Membro","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eConcedido\u003c/a\u003e envio de convites"},"regular":{"name":"Regular","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eConcedido\u003c/a\u003e recategorizar, renomear, seguir links e sala de lazer"},"leader":{"name":"Líder","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eConcedido\u003c/a\u003e edição global, fixar, fechar, arquivar, dividir e mesclar"},"welcome":{"name":"Bem-Vindo","description":"Recebeu uma curtida"},"autobiographer":{"name":"Autobiógrafo","description":"Preencher informações do \u003ca href=\"/my/preferences\"\u003eperfil\u003c/a\u003e"},"anniversary":{"name":"Aniversário","description":"Membro ativo por um ano, postou ao menos uma vez"},"nice_post":{"name":"Post Legal","description":"Recebeu 10 curtidas em uma resposta. Esse emblema pode ser concedido várias vezes."},"good_post":{"name":"Bom Post","description":"Recebeu 25 curtidas em uma resposta. Esse emblema pode ser concedido várias vezes."},"great_post":{"name":"Ótimo Post","description":"Recebeu 50 curtidas em uma resposta. Esse emblema pode ser concedido várias vezes."},"nice_topic":{"name":"Tópico Interessante","description":"Recebeu 10 curtidas em um tópico. Esse emblema pode ser concedido várias vezes."},"good_topic":{"name":"Tópico Bom","description":"Recebeu 25 curtidas em um tópico. Esse emblema pode ser concedido várias vezes."},"great_topic":{"name":"Tópico Excelente","description":"Recebeu 50 curtidas em um tópico. Esse emblema pode ser concedido várias vezes."},"nice_share":{"name":"Compartilhamento Interessante","description":"Compartilhou uma postagem com 25 visitas únicas"},"good_share":{"name":"Compartilhamento Bom","description":"Compartilhou uma postagem com 300 visitas únicas"},"great_share":{"name":"Compartilhamento Excelente","description":"Compartilhou uma postagem com 1000 visitas únicas"},"first_like":{"name":"Primeiro Like","description":"Curtiu uma resposta"},"first_flag":{"name":"Primeira Marcação","description":"Sinalizar uma resposta"},"promoter":{"name":"Promotor","description":"Convidou um usuário"},"campaigner":{"name":"Veterano","description":"Convidou 3 usuários básicos (nível de confiança 1)"},"champion":{"name":"Campeão","description":"Convidou 5 usuários básicos (nível de confiança 2)"},"first_share":{"name":"Primeiro Compartilhamento","description":"Compartilhar uma resposta"},"first_link":{"name":"Primeiro Link","description":"Adicionar um link interno em outro tópico"},"first_quote":{"name":"Primeira citação","description":"Citado um usuário"},"read_guidelines":{"name":"Ler as regras","description":"Leia as \u003ca href=\"/guidelines\"\u003eregras da comunidade\u003c/a\u003e"},"reader":{"name":"Leitor","description":"Leia cada resposta em um tópico com mais de 100 respostas"},"popular_link":{"name":"Link Popular","description":"Postou um link externo com pelo menos 50 cliques"},"hot_link":{"name":"Link Quente","description":"Postou um link externo com pelo menos 300 cliques"},"famous_link":{"name":"Link Famoso","description":"Postou um link externo com pelo menos 1000 cliques"}}},"google_search":"\u003ch3\u003eBuscar com o Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topics":{"bulk":{"dismiss_tooltip":"Dismiss just new posts or stop tracking topics"}},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls"},"post":{"has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"}},"category":{"contains_messages":"Change this category to only contain messages."},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"bulk":"Bulk Add to Group","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'pt_BR';
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
// moment.js language configuration
// language : brazilian portuguese (pt-br)
// author : Caio Ribeiro Pereira : https://github.com/caio-ribeiro-pereira

moment.lang('pt_BR', {
    months : "Janeiro_Fevereiro_Março_Abril_Maio_Junho_Julho_Agosto_Setembro_Outubro_Novembro_Dezembro".split("_"),
    monthsShort : "Jan_Fev_Mar_Abr_Mai_Jun_Jul_Ago_Set_Out_Nov_Dez".split("_"),
    weekdays : "Domingo_Segunda-feira_Terça-feira_Quarta-feira_Quinta-feira_Sexta-feira_Sábado".split("_"),
    weekdaysShort : "Dom_Seg_Ter_Qua_Qui_Sex_Sáb".split("_"),
    weekdaysMin : "Dom_2ª_3ª_4ª_5ª_6ª_Sáb".split("_"),
    longDateFormat : {
        LT : "HH:mm",
        L : "DD/MM/YYYY",
        LL : "D [de] MMMM [de] YYYY",
        LLL : "D [de] MMMM [de] YYYY LT",
        LLLL : "dddd, D [de] MMMM [de] YYYY LT"
    },
    calendar : {
        sameDay: '[Hoje às] LT',
        nextDay: '[Amanhã às] LT',
        nextWeek: 'dddd [às] LT',
        lastDay: '[Ontem às] LT',
        lastWeek: function () {
            return (this.day() === 0 || this.day() === 6) ?
                '[Último] dddd [às] LT' : // Saturday + Sunday
                '[Última] dddd [às] LT'; // Monday - Friday
        },
        sameElse: 'L'
    },
    relativeTime : {
        future : "em %s",
        past : "%s atrás",
        s : "segundos",
        m : "um minuto",
        mm : "%d minutos",
        h : "uma hora",
        hh : "%d horas",
        d : "um dia",
        dd : "%d dias",
        M : "um mês",
        MM : "%d meses",
        y : "um ano",
        yy : "%d anos"
    },
    ordinal : '%dº'
});

moment.fn.shortDateNoYear = function(){ return this.format('D MMM'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('D de MMMM de YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
