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
MessageFormat.locale.pt = function ( n ) {
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
r += "Existe <a href='/unread'>1 não lido </a> ";
return r;
},
"other" : function(d){
var r = "";
r += "Existem <a href='/unread'>" + (function(){ var x = k_1 - off_0;
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
r += (pf_0[ MessageFormat.locale["pt"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "existe ";
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
r += "existem ";
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
r += (pf_0[ MessageFormat.locale["pt"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
}
r += " restantes, ou ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "CATEGORY";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"true" : function(d){
var r = "";
r += "pesquise outros tópicos em ";
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
} , "posts_likes_MF" : function(){ return "Invalid Format: No 'other' form found in selectFormatPattern 0";}});I18n.translations = {"pt":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"Byte","other":"Bytes"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"hh:mm","long_no_year":"DD MMM hh:mm","long_no_year_no_time":"DD MMM","full_no_year_no_time":"Do MMMM","long_with_year":"DD MMM YYYY hh:mm","long_with_year_no_time":"DD MMM YYYY","full_with_year_no_time":"Do MMMM, YYYY","long_date_with_year":"DD MMM, 'YY LT","long_date_without_year":"DD MMM, LT","long_date_with_year_without_time":"DD MMM, 'YY","long_date_without_year_with_linebreak":"DD MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"DD MMM, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","other":"%{count}m"},"about_x_hours":{"one":"1h","other":"%{count}h"},"x_days":{"one":"1d","other":"%{count}d"},"about_x_years":{"one":"1a","other":"%{count}a"},"over_x_years":{"one":"\u003e 1a","other":"\u003e %{count}a"},"almost_x_years":{"one":"1a","other":"%{count}a"},"date_month":"DD MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuto","other":"%{count} minutos"},"x_hours":{"one":"1 hora","other":"%{count} horas"},"x_days":{"one":"1 dia","other":"%{count} dias"},"date_year":"DD MMM, 'YY"},"medium_with_ago":{"x_minutes":{"one":"1 minuto atrás","other":"%{count} minutos atrás"},"x_hours":{"one":"1 hora atrás","other":"%{count} horas atrás"},"x_days":{"one":"1 dia atrás","other":"%{count} dias atrás"}},"later":{"x_days":{"one":"1 dia mais tarde","other":"%{count} dias mais tarde"},"x_months":{"one":"1 mês mais tarde","other":"%{count} meses mais tarde"},"x_years":{"one":"1 ano mais tarde","other":"%{count} anos mais tarde"}}},"share":{"topic":"partilhar uma hiperligação para este tópico","post":"Mensagem #%{postNumber}","close":"fechar","twitter":"partilhar esta hiperligação no Twitter","facebook":"partilhar esta hiperligação no Facebook","google+":"partilhar esta hiperligação no Google+","email":"enviar esta hiperligação por email"},"action_codes":{"split_topic":"dividir este tópico %{when}","autoclosed":{"enabled":"fechado %{when}","disabled":"aberto %{when}"},"closed":{"enabled":"fechado %{when}","disabled":"aberto %{when}"},"archived":{"enabled":"arquivado %{when}","disabled":"removido do arquivo %{when}"},"pinned":{"enabled":"fixado %{when}","disabled":"desafixado %{when}"},"pinned_globally":{"enabled":"fixado globalmente %{when}","disabled":"desafixado %{when}"},"visible":{"enabled":"listado %{when}","disabled":"removido da lista %{when}"}},"topic_admin_menu":"Ações administrativas dos Tópicos","emails_are_disabled":"Todos os envios de e-mail foram globalmente desativados por um administrador. Nenhum e-mail de notificação será enviado.","edit":"editar o título e a categoria deste tópico","not_implemented":"Essa funcionalidade ainda não foi implementada, pedimos desculpa!","no_value":"Não","yes_value":"Sim","generic_error":"Pedimos desculpa, ocorreu um erro.","generic_error_with_reason":"Ocorreu um erro: %{error}","sign_up":"Inscrever-se","log_in":"Entrar","age":"Idade","joined":"Juntou-se","admin_title":"Administração","flags_title":"Sinalizações","show_more":"mostrar mais","show_help":"opções","links":"Hiperligações","links_lowercase":{"one":"hiperligação","other":"hiperligações"},"faq":"FAQ","guidelines":"Diretrizes","privacy_policy":"Política de Privacidade","privacy":"Privacidade","terms_of_service":"Termos de Serviço","mobile_view":"Visualização Mobile","desktop_view":"Visualização Desktop","you":"Você","or":"ou","now":"ainda agora","read_more":"ler mais","more":"Mais","less":"Menos","never":"nunca","daily":"diário","weekly":"semanal","every_two_weeks":"a cada duas semanas","every_three_days":"a cada três dias","max_of_count":"máximo de {{count}}","alternation":"ou","character_count":{"one":"{{count}} caracter","other":"{{count}} caracteres"},"suggested_topics":{"title":"Tópicos Sugeridos"},"about":{"simple_title":"Acerca","title":"Acerca de %{title}","stats":"Estatísticas do sítio","our_admins":"Os Nossos Administradores","our_moderators":"Os Nossos Moderadores","stat":{"all_time":"Sempre","last_7_days":"Últimos 7 Dias","last_30_days":"Últimos 30 Dias"},"like_count":"Gostos","topic_count":"Tópicos","post_count":"Mensagens","user_count":"Novos Utilizadores","active_user_count":"Utilizadores Activos","contact":"Contacte-nos","contact_info":"No caso de um problema crítico ou de algum assunto urgente que afecte este sítio, por favor contacte-nos em %{contact_info}."},"bookmarked":{"title":"Adicionar Marcador","clear_bookmarks":"Remover Marcadores","help":{"bookmark":"Clique para adicionar um marcador à primeira mensagem deste tópico","unbookmark":"Clique para remover todos os marcadores deste tópico"}},"bookmarks":{"not_logged_in":"Pedimos desculpa, é necessário ter sessão iniciada para marcar mensagens","created":"adicionou esta mensagem aos marcadores","not_bookmarked":"leu esta mensagem; clique para adicioná-la aos marcadores","last_read":"esta foi a última mensagem que leu; clique para adicioná-la aos marcadores","remove":"Remover Marcador","confirm_clear":"Tem a certeza que pretende eliminar todos os marcadores deste tópico?"},"topic_count_latest":{"one":"{{count}} tópico novo ou atualizado.","other":"{{count}} tópicos novos ou atualizados."},"topic_count_unread":{"one":"{{count}} tópico não lido.","other":"{{count}} tópicos não lidos."},"topic_count_new":{"one":"{{count}} novo tópico.","other":"{{count}} novos tópicos."},"click_to_show":"Clique para mostrar.","preview":"pré-visualizar","cancel":"cancelar","save":"Guardar alterações","saving":"A guardar...","saved":"Guardado!","upload":"Carregar","uploading":"A carregar…","uploading_filename":"A carregar {{filename}}...","uploaded":"Carregado!","enable":"Ativar ","disable":"Desativar","undo":"Desfazer","revert":"Reverter","failed":"Falhou","switch_to_anon":"Modo Anónimo","switch_from_anon":"Sair de Anónimo","banner":{"close":"Destituir esta faixa.","edit":"Editar esta faixa \u003e\u003e"},"choose_topic":{"none_found":"Nenhum tópico encontrado.","title":{"search":"Procurar Tópico por nome, URL ou id:","placeholder":"digite o título do tópico aqui"}},"queue":{"topic":"Tópico:","approve":"Aprovar","reject":"Rejeitar","delete_user":"Eliminar Utilizador","title":"Necessita de Aprovação","none":"Não há mensagens para rever.","edit":"Editar","cancel":"Cancelar","view_pending":"ver mensagens pendentes","has_pending_posts":{"one":"Este tópico tem \u003cb\u003e1\u003c/b\u003e mensagem à espera de aprovação","other":"Este tópico tem \u003cb\u003e{{count}}\u003c/b\u003e mensagens à espera de aprovação"},"confirm":"Guardar Alterações","delete_prompt":"Tem a certeza que deseja eliminar \u003cb\u003e%{username}\u003c/b\u003e? Isto irá remover todas as suas mensagens e bloquear os seus emails e endereços ip.","approval":{"title":"A Mensagem Necessita de Aprovação","description":"Recebemos a sua nova mensagem mas necessita de ser aprovada pelo moderador antes de aparecer. Por favor seja paciente.","pending_posts":{"one":"Tem \u003cstrong\u003e1\u003c/strong\u003e mensagem pendente.","other":"Tem \u003cstrong\u003e{{count}}\u003c/strong\u003e mensagens pendentes."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e publicou \u003ca href='{{topicUrl}}'\u003eo tópico\u003c/a\u003e","you_posted_topic":"\u003ca href='{{userUrl}}'\u003e\u003c/a\u003e publicou\u003ca href='{{topicUrl}}'\u003eo tópico\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e respondeu a \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"\u003ca href='{{userUrl}}'\u003e\u003c/a\u003e respondeu a \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e respondeu ao \u003ca href='{{topicUrl}}'\u003etópico\u003c/a\u003e","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e\u003c/a\u003e respondeu ao \u003ca href='{{topicUrl}}'\u003etópico\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e mencionou \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e\u003ca href='{{user2Url}}'\u003e mencionou-o\u003c/a\u003e","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003e\u003c/a\u003e mencionou \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Publicado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Publicado por \u003ca href='{{userUrl}}'\u003esi\u003c/a\u003e","sent_by_user":"Enviado por \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Enviado por \u003ca href='{{userUrl}}'\u003esi\u003c/a\u003e"},"directory":{"filter_name":"filtrar por nome de utilizador","title":"Utilizadores","likes_given":"Dado","likes_received":"Recebido","topics_entered":"Inserido","topics_entered_long":"Tópicos Inseridos","time_read":"Tempo Lido","topic_count":"Tópicos","topic_count_long":"Tópicos Criados","post_count":"Respostas","post_count_long":"Respostas Publicadas","no_results":"Não foram encontrados resultados.","days_visited":"Visitas","days_visited_long":"Dias Visitados","posts_read":"Ler","posts_read_long":"Mensagens Lidas","total_rows":{"one":"1 utilizador","other":"%{count} utilizadores"}},"groups":{"add":"Adicionar","selector_placeholder":"Adicionar membros","owner":"proprietário","visible":"O grupo é visível para todos os utilizadores","title":{"one":"grupo","other":"grupos"},"members":"Membros","posts":"Mensagens","alias_levels":{"title":"Quem pode usar este grupo como pseudónimo?","nobody":"Ninguém","only_admins":"Apenas administradores","mods_and_admins":"Apenas moderadores e Administradores","members_mods_and_admins":"Apenas membros do grupo, moderadores e administradores","everyone":"Todos"},"trust_levels":{"title":"Nível de confiança concedido automaticamente a membros quando são adicionados:","none":"Nenhum"}},"user_action_groups":{"1":"Gostos Dados","2":"Gostos Recebidos","3":"Marcadores","4":"Tópicos","5":"Respostas","6":"Respostas","7":"Menções","9":"Citações","10":"Favoritos","11":"Edições","12":"Itens Enviados","13":"Caixa de Entrada","14":"Pendente"},"categories":{"all":"todas as categorias","all_subcategories":"todas","no_subcategory":"nenhuma","category":"Categoria","reorder":{"title":"Re-organizar Categorias","title_long":"Re-organizar a lista de categorias","fix_order":"Fixar Posições","fix_order_tooltip":"Nem todas as categorias têm um número único de posição, o que pode causar resultados inesperados.","save":"Guardar Ordem","apply_all":"Aplicar","position":"Posição"},"posts":"Mensagens","topics":"Tópicos","latest":"Recentes","latest_by":"recentes por","toggle_ordering":"alternar o controlo de ordenação","subcategories":"Subcategorias","topic_stats":"Número de tópicos novos.","topic_stat_sentence":{"one":"%{count} novo tópico no passado %{unit}.","other":"%{count} novos tópicos no passado %{unit}."},"post_stats":"Número de mensagens novas.","post_stat_sentence":{"one":"%{count} nova mensagem no passado %{unit}.","other":"%{count} novas mensagens no passado %{unit}."}},"ip_lookup":{"title":"Pesquisa de Endereço IP","hostname":"Nome do Servidor","location":"Localização","location_not_found":"(desconhecido)","organisation":"Organização","phone":"Telefone","other_accounts":"Outras contas com este endereço IP:","delete_other_accounts":"Apagar %{count}","username":"nome de utilizador","trust_level":"TL","read_time":"tempo de leitura","topics_entered":"tópicos inseridos","post_count":"# mensagens","confirm_delete_other_accounts":"Tem a certeza que quer apagar estas contas?"},"user_fields":{"none":"(selecione uma opção)"},"user":{"said":"{{username}}:","profile":"Perfil","mute":"Silenciar","edit":"Editar Preferências","download_archive":"Descarregar As Minhas Mensagens","new_private_message":"Nova Mensagem","private_message":"Mensagem","private_messages":"Mensagens","activity_stream":"Atividade","preferences":"Preferências","expand_profile":"Expandir","bookmarks":"Marcadores","bio":"Sobre mim","invited_by":"Convidado Por","trust_level":"Nível de Confiança","notifications":"Notificações","desktop_notifications":{"label":"Notificações de Desktop","not_supported":"Não são suportadas notificações neste navegador. Desculpe.","perm_default":"Ligar Notificações","perm_denied_btn":"Permissão Negada","perm_denied_expl":"Tem permissões negadas para notificações. Utilize o seu navegador para ativar notificações, de seguida clique no botão quando concluir. (Desktop: O ícone mais à esquerda na barra de endereço. Móvel: 'Info do Sítio'.)","disable":"Desativar Notificações","currently_enabled":"(atualmente ativo)","enable":"Ativar Notificações","currently_disabled":"(atualmente inativo)","each_browser_note":"Nota: Tem que alterar esta configuração em todos os navegadores de internet que utiliza."},"dismiss_notifications":"Marcar tudo como lido","dismiss_notifications_tooltip":"Marcar como lidas todas as notificações por ler","disable_jump_reply":"Não voltar para a minha mensagem após ter respondido","dynamic_favicon":"Mostrar contagem de tópicos novos / atualizados no ícone do browser.","edit_history_public":"Permitir que outros utilizadores vejam as minhas revisões de publicação","external_links_in_new_tab":"Abrir todas as hiperligações externas num novo separador","enable_quoting":"Ativar resposta usando citação de texto destacado","change":"alterar","moderator":"{{user}} é um moderador","admin":"{{user}} é um administrador","moderator_tooltip":"Este utilizador é um moderador","admin_tooltip":"Este utilizador é um administrador","blocked_tooltip":"Este utilizador está bloqueado","suspended_notice":"Este utilizador está suspenso até {{date}}.","suspended_reason":"Motivo: ","github_profile":"Github","mailing_list_mode":"Enviar-me um email por cada nova mensagem (a não ser que eu silencie o tópico ou categoria)","watched_categories":"Vigiado","watched_categories_instructions":"Irá acompanhar automaticamente todos os novos tópicos nestas categorias. Será notificado de todas as novas mensagens e tópicos, e uma contagem de novas mensagens irá aparecer junto ao tópico.","tracked_categories":"Acompanhado","tracked_categories_instructions":"Irá acompanhar automaticamente todos os novos tópicos nestas categorias. Uma contagem de novas mensagens irá aparecer junto ao tópico.","muted_categories":"Silenciado","muted_categories_instructions":"Não será notificado de nada acerca de novos tópicos nestas categorias, e estes não irão aparecer nos recentes.","delete_account":"Eliminar A Minha Conta","delete_account_confirm":"Tem a certeza que pretende eliminar a sua conta de forma permanente? Esta ação não pode ser desfeita!","deleted_yourself":"A sua conta foi eliminada com sucesso.","delete_yourself_not_allowed":"Neste momento não pode eliminar a sua conta. Contacte um administrador para que este elimine a sua conta por si.","unread_message_count":"Mensagens","admin_delete":"Apagar","users":"Utilizadores","muted_users":"Mudo","muted_users_instructions":"Suprimir todas as notificações destes utilizadores.","muted_topics_link":"Mostrar tópicos mudos","automatically_unpin_topics":"Desafixar tópicos automaticamente quando você chegar ao final.","staff_counters":{"flags_given":"sinalizações úteis","flagged_posts":"mensagens sinalizadas","deleted_posts":"mensagens eliminadas","suspensions":"suspensões","warnings_received":"avisos"},"messages":{"all":"Todas","mine":"Minha","unread":"Não lidas"},"change_password":{"success":"(email enviado)","in_progress":"(a enviar email)","error":"(erro)","action":"Enviar email de recuperação de palavra-passe","set_password":"Definir Palavra-passe"},"change_about":{"title":"Modificar Sobre Mim","error":"Ocorreu um erro ao alterar este valor."},"change_username":{"title":"Alterar Nome de Utilizador","confirm":"Se mudar o seu nome de utilizador, todas as citações anteriores das suas mensagens e menções a @nome serão quebradas. Tem a certeza que deseja fazê-lo?","taken":"Pedimos desculpa, esse nome de utilizador já está a ser utilizado.","error":"Ocorreu um erro ao alterar o seu nome de utilizador.","invalid":"Esse nome de utilizador é inválido. Deve conter apenas números e letras."},"change_email":{"title":"Alterar Email","taken":"Pedimos desculpa, esse email não está disponível.","error":"Ocorreu um erro ao alterar o email. Talvez esse endereço já esteja a ser utilizado neste fórum?","success":"Enviámos um email para esse endereço. Por favor siga as instruções de confirmação."},"change_avatar":{"title":"Alterar a sua imagem de perfil","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, baseado em","gravatar_title":"Mude o seu avatar no sítio Gravatar","refresh_gravatar_title":"Atualize o seu Gravatar","letter_based":"Imagem de perfil atribuída pelo sistema","uploaded_avatar":"Foto personalizada","uploaded_avatar_empty":"Adicionar foto personalizada","upload_title":"Carregar a sua foto","upload_picture":"Carregar Imagem","image_is_not_a_square":"Alerta: cortámos a sua imagem; o comprimento e a altura não eram iguais.","cache_notice":"Alterou a sua fotografia de perfil com sucesso mas poderá demorar algum tempo até esta aparecer devido à cache do navegador de internet."},"change_profile_background":{"title":"Fundo de Perfil","instructions":"O fundo do perfil será centrado e terá por defeito uma largura de 850px."},"change_card_background":{"title":"Fundo do cartão de utilizador","instructions":"As imagens de fundo serão centradas e terão por defeito uma largura de 590px."},"email":{"title":"Email","instructions":"Nunca mostrado ao público","ok":"Enviar-lhe-emos um email para confirmar","invalid":"Por favor introduza um endereço de email válido","authenticated":"O seu email foi autenticado por {{provider}}","frequency_immediately":"Enviar-lhe-emos um email imediatamente caso não leia o que lhe estamos a enviar.","frequency":{"one":"Só iremos enviar-lhe um email se não o tivermos visto no último minuto.","other":"Só iremos enviar-lhe um email se não o tivermos visto nos últimos {{count}} minutos."}},"name":{"title":"Nome","instructions":"O seu nome completo (opcional)","instructions_required":"O seu nome completo","too_short":"O seu nome é demasiado curto","ok":"O seu nome parece adequado"},"username":{"title":"Nome de Utilizador","instructions":"Único, sem espaços, curto","short_instructions":"Podem mencioná-lo como @{{username}}","available":"O seu nome de utilizador está disponível","global_match":"O email coincide com o nome de utilizador no registo","global_mismatch":"Já está registado. Tente {{suggestion}}?","not_available":"Não está disponível. Tente {{suggestion}}?","too_short":"O seu nome de utilizador é demasiado curto","too_long":"O seu nome de utilizador é demasiado longo","checking":"A verificar a disponibilidade do nome de utilizador...","enter_email":"Nome de utilizador encontrado, introduza o email correspondente","prefilled":"Email corresponde com o nome de utilizador registado"},"locale":{"title":"Idioma da Interface","instructions":"Idioma da interface de utilizador. Será alterado quando atualizar a página.","default":"(pré-definido)"},"password_confirmation":{"title":"Palavra-passe Novamente"},"last_posted":"Última Publicação","last_emailed":"Último Email","last_seen":"Visto","created":"Juntou-se","log_out":"Terminar sessão","location":"Localização","card_badge":{"title":"Medalha de cartão de utilizador"},"website":"Sítio da Internet","email_settings":"Email","email_digests":{"title":"Quando não visitar o sítio, enviar um email com o resumo das novidades:","daily":"diariamente","every_three_days":"a cada três dias","weekly":"semanalmente","every_two_weeks":"a cada duas semanas"},"email_direct":"Enviar-me um email quando alguém me citar, responder às minhas mensagens, mencionar o meu @nomedeutilizador, ou convidar-me para um tópico","email_private_messages":"Enviar-me um email quando alguém me envia uma mensagem","email_always":"Enviar-me notificações de email mesmo quando estou ativo no sítio","other_settings":"Outros","categories_settings":"Categorias","new_topic_duration":{"label":"Considerar tópicos como novos quando","not_viewed":"Ainda não os vi","last_here":"criado desde a última vez que aqui estive","after_1_day":"criado no último dia","after_2_days":"criado nos últimos 2 dias","after_1_week":"criado na última semana","after_2_weeks":"criado nas últimas 2 semanas"},"auto_track_topics":"Acompanhar automaticamente os tópicos em que eu entro","auto_track_options":{"never":"nunca","immediately":"imediatamente","after_30_seconds":"após 30 segundos","after_1_minute":"após 1 minuto","after_2_minutes":"após 2 minutos","after_3_minutes":"após 3 minutos","after_4_minutes":"após 4 minutos","after_5_minutes":"após 5 minutos","after_10_minutes":"após 10 minutos"},"invited":{"search":"digite para procurar convites...","title":"Convites","user":"Utilizadores Convidados","sent":"Enviado","none":"Não há convites pendentes para mostrar.","truncated":{"one":"A exibir o primeiro convite.","other":"A exibir os primeiros {{count}} convites."},"redeemed":"Convites Resgatados","redeemed_tab":"Resgatado","redeemed_tab_with_count":"Resgatados ({{count}})","redeemed_at":"Resgatado","pending":"Convites Pendentes","pending_tab":"Pendente","pending_tab_with_count":"Pendentes ({{count}})","topics_entered":"Tópicos Visualizados","posts_read_count":"Mensagens Lidas","expired":"Este convite expirou.","rescind":"Remover","rescinded":"Convite Removido","reinvite":"Reenviar convite","reinvited":"Convite reenviado","time_read":"Tempo de Leitura","days_visited":"Dias Visitados","account_age_days":"Idade da conta, em dias","create":"Enviar um Convite","generate_link":"Copiar Hiperligação do Convite","generated_link_message":"\u003cp\u003eHiperligação do Convite gerada corretamente!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eA hiperligação do convite é válida apenas para este endereço de email: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Ainda não convidou ninguém. Pode enviar convites individuais, ou convidar um grupo de pessoas de uma única vez \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003e carregando um ficheiro com convites em massa.","text":"Convite em massa a partir de ficheiro","uploading":"A carregar…","success":"Ficheiro carregado corretamente, será notificado via mensagem assim que o processo esteja concluído.","error":"Erro de carregamento '{{filename}}': {{message}}"}},"password":{"title":"Palavra-passe","too_short":"A sua palavra-passe é muito curta.","common":"Essa palavra-passe é demasiado comum.","same_as_username":"A sua palavra-passe é a mesma que o seu nome de utilizador.","same_as_email":"A sua palavra-passe é a mesma que o seu email.","ok":"A sua palavra-passe parece correta.","instructions":"Pelo menos %{count} caracteres."},"associated_accounts":"Contas associadas","ip_address":{"title":"Último endereço IP"},"registration_ip_address":{"title":"Endereço IP de registo"},"avatar":{"title":"Imagem de Perfil","header_title":"perfil, mensagens, marcadores e preferências"},"title":{"title":"Título"},"filters":{"all":"Todos"},"stream":{"posted_by":"Publicado por","sent_by":"Enviado por","private_message":"mensagem","the_topic":"o tópico"}},"loading":"A carregar...","errors":{"prev_page":"enquanto tenta carregar","reasons":{"network":"Erro de Rede","server":"Erro de Servidor","forbidden":"Acesso Negado","unknown":"Erro","not_found":"Página Não Encontrada"},"desc":{"network":"Por favor verifique a sua ligação.","network_fixed":"Parece que está de volta.","server":"Código de Erro: {{status}}","forbidden":"Não tem permissão para visualizar isso.","not_found":"Oops, a aplicação tentou carregar um URL que não existe.","unknown":"Algo correu mal."},"buttons":{"back":"Voltar Atrás","again":"Tentar Novamente","fixed":"Carregar Página"}},"close":"Fechar","assets_changed_confirm":"Este sítio foi atualizado. Recarregar agora para a versão mais recente?","logout":"A sua sessão estava encerrada.","refresh":"Atualizar","read_only_mode":{"enabled":"O modo só de leitura está ativo. Pode continuar a navegar no sítio mas as interações podem não funcionar.","login_disabled":"A função de início de sessão está desativada enquanto o sítio se encontrar no modo só de leitura."},"too_few_topics_and_posts_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar esta discussão!\u003c/a\u003e Atualmente existem \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tópicos e \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensagens. Novos visitantes precisam de conversações para ler e responder a.","too_few_topics_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar esta discussão!\u003c/a\u003e Atualmente existem \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e tópios. Novos visitantes precisam de algumas conversações para ler e responder a.","too_few_posts_notice":"Vamos \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ecomeçar esta discussão!\u003c/a\u003e Atualmente existem \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e mensagens. Novos visitantes precisam de algumas conversações para ler e responder a.","learn_more":"saber mais...","year":"ano","year_desc":"tópicos criados nos últimos 365 dias","month":"mês","month_desc":"tópicos criados nos últimos 30 dias","week":"semana","week_desc":"tópicos criados nos últimos 7 dias","day":"dia","first_post":"Primeira mensagem","mute":"Silenciar","unmute":"Reativar","last_post":"Última mensagem","last_reply_lowercase":"última resposta","replies_lowercase":{"one":"resposta","other":"respostas"},"signup_cta":{"sign_up":"Inscrever-se","hide_session":"Lembrar-me amanhã","hide_forever":"não obrigado","hidden_for_session":"OK, Irei perguntar-lhe amanhã. Pode sempre usar 'Iniciar Sessão' para criar uma conta, também.","intro":"Olá! :heart_eyes: Parece que está a gostar da discussão, mas não está inscrito para uma conta.","value_prop":"Quando cria uma conta, nós lembramo-nos exatamente do que leu, por isso volta sempre ao sítio onde ficou. Também recebe notificações, aqui ou por email, sempre que novas mensagens são feitas. E pode gostar de mensagens para partilhar o amor. :heartbeat:"},"summary":{"enabled_description":"Está a ver um resumo deste tópico: as mensagens mais interessantes são determinados pela comunidade.","description":"Existem \u003cb\u003e{{count}}\u003c/b\u003e respostas.","description_time":"Existem \u003cb\u003e{{count}}\u003c/b\u003e respostas com um tempo de leitura estimado de \u003cb\u003e{{readingTime}} minutos\u003c/b\u003e.","enable":"Resumir Este Tópico","disable":"Mostrar Todas As Mensagens"},"deleted_filter":{"enabled_description":"Este tópico contém mensagens eliminadas, as quais foram ocultas.","disabled_description":"Mensagens eliminadas no tópico são exibidas.","enable":"Ocultar mensagens eliminadas","disable":"Exibir mensagens eliminadas"},"private_message_info":{"title":"Mensagem","invite":"Convidar Outros...","remove_allowed_user":"Deseja mesmo remover {{name}} desta mensagem?"},"email":"Email","username":"Nome de utilizador","last_seen":"Visto","created":"Criado","created_lowercase":"criado","trust_level":"Nível de Confiança","search_hint":"nome de utilizador, email ou endereço de IP","create_account":{"title":"Criar Nova Conta","failed":"Ocorreu um erro, talvez este email já esteja registado, tente usar a hiperligação \"Esqueci-me da Palavra-passe\"."},"forgot_password":{"title":"Repor Palavra-Passe","action":"Esqueci-me da minha palavra-passe","invite":"Insira o seu nome de utilizador ou endereço de email, e enviar-lhe-emos um email para refazer a sua palavra-passe.","reset":"Repor Palavra-passe","complete_username":"Se uma conta corresponder ao nome de utilizador \u003cb\u003e%{username}\u003c/b\u003e, deverá receber em pouco tempo um email com instruções para repor a sua palavra-passe.","complete_email":"Se uma conta corresponder \u003cb\u003e%{email}\u003c/b\u003e, deverá receber em pouco tempo um email com instruções para repor a sua palavra-passe.","complete_username_found":"Encontrámos uma conta correspondente ao nome de utilizador \u003cb\u003e%{username}\u003c/b\u003e, deverá receber em pouco tempo um email com instruções para repor a sua palavra-passe.","complete_email_found":"Encontrámos uma conta correspondente a \u003cb\u003e%{email}\u003c/b\u003e, deverá receber em breve um email com instruções para repor a sua palavra-passe.","complete_username_not_found":"Não existe nenhuma conta correspondente ao nome de utilizador \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Não existe nenhuma conta correspondente a \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Entrar","username":"Utilizador","password":"Palavra-passe","email_placeholder":"email ou nome de utilizador","caps_lock_warning":"Caps Lock está ligado","error":"Erro desconhecido","rate_limit":"Por favor espere antes de tentar iniciar sessão novamente.","blank_username_or_password":"Por favor insira o seu email ou nome de utilizador, e palavra-passe.","reset_password":"Repor Palavra-passe","logging_in":"A iniciar sessão...","or":"Ou","authenticating":"A autenticar...","awaiting_confirmation":"A sua conta está a aguardar ativação. Utilize a hiperligação \"Esqueci a Palavra-passe\" para pedir um novo email de ativação.","awaiting_approval":"A sua conta ainda não foi aprovada por um membro do pessoal. Receberá um email quando a sua conta for aprovada.","requires_invite":"Pedimos desculpa, o acesso a este fórum é permitido somente por convite de outro membro.","not_activated":"Ainda não pode iniciar sessão. Enviámos anteriormente um email de ativação para o endereço \u003cb\u003e{{sentTo}}\u003c/b\u003e. Por favor siga as instruções contidas nesse email para ativar a sua conta.","not_allowed_from_ip_address":"Não pode iniciar sessão a partir desse endereço IP.","admin_not_allowed_from_ip_address":"Não pode iniciar sessão como administrador a partir desse endereço IP.","resend_activation_email":"Clique aqui para enviar o email de ativação novamente.","sent_activation_email_again":"Enviámos mais um email de ativação para o endereço \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Pode ser que demore alguns minutos; certifique-se que verifica a sua pasta de spam ou lixo.","to_continue":"Por favor Inicie Sessão","preferences":"Necessita de ter sessão iniciada para alterar as suas preferências de utilizador.","forgot":"Não me recordo dos detalhes da minha conta","google":{"title":"com Google","message":"A autenticar com Google (certifique-se de que os bloqueadores de popup estão desativados)"},"google_oauth2":{"title":"com Google","message":"A autenticar com Google (certifique-se de que os bloqueadores de popup estão desativados)"},"twitter":{"title":"com Twitter","message":"A autenticar com Twitter (certifique-se de que os bloqueadores de popup estão desativados)"},"facebook":{"title":"com Facebook","message":"A autenticar com o Facebook (certifique-se de que os bloqueadores de popup estão desativados)"},"yahoo":{"title":"com Yahoo","message":"A autenticar com Yahoo (certifique-se de que os bloqueadores de popup estão desativados)"},"github":{"title":"com GitHub","message":"A autenticar com GitHub (certifique-se de que os bloqueadores de popup estão desativados)"}},"apple_international":"Apple/International","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"mais...","options":"Opções","whisper":"susurro","add_warning":"Este é um aviso oficial.","toggle_whisper":"Alternar Sussuro","posting_not_on_topic":"A que tópico quer responder?","saving_draft_tip":"a guardar...","saved_draft_tip":"guardado","saved_local_draft_tip":"guardado localmente","similar_topics":"O seu tópico é similar a...","drafts_offline":"rascunhos offline","error":{"title_missing":"O título é obrigatório","title_too_short":"O título tem que ter pelo menos {{min}} caracteres.","title_too_long":"O tíítulo não pode conter mais do que {{max}} caracteres.","post_missing":"A mensagem não pode estar vazia","post_length":"A mensagem tem que ter pelo menos {{min}} caracteres.","try_like":"Já tentou o botão \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Tem que escolher uma categoria"},"save_edit":"Guardar alterações","reply_original":"Responder no Tópico Original","reply_here":"Responda Aqui","reply":"Responder","cancel":"Cancelar","create_topic":"Criar Tópico","create_pm":"Mensagem","title":"Ou prima Ctrl+Enter","users_placeholder":"Adicionar um utilizador","title_placeholder":"Numa breve frase, de que se trata esta discussão?","edit_reason_placeholder":"Porque está a editar?","show_edit_reason":"(adicione a razão para a edição)","reply_placeholder":"Digite aqui. Utilize Markdown, BBCode, ou HTML para formatar. Arraste ou cole imagens.","view_new_post":"Ver a sua nova mensagem.","saving":"A Guardar","saved":"Guardado!","saved_draft":"Rascunho da mensagem em progresso. Selecione para continuar.","uploading":"A carregar…","show_preview":"mostrar pré-visualização \u0026raquo;","hide_preview":"\u0026laquo; esconder pré-visualização","quote_post_title":"Citar mensagem inteira","bold_title":"Negrito","bold_text":"texto em negrito","italic_title":"Itálico","italic_text":"texto em itálico","link_title":"Hiperligação","link_description":"digite a descrição da hiperligação aqui","link_dialog_title":"Inserir Hiperligação","link_optional_text":"título opcional","link_placeholder":"http://example.com \"texto opcional\"","quote_title":"Bloco de Citação","quote_text":"Bloco de Citação","code_title":"Texto pré-formatado","code_text":"identar texto pré-formatado até 4 espaços","upload_title":"Carregar","upload_description":"digite aqui a descrição do ficheiro carregado","olist_title":"Lista numerada","ulist_title":"Lista de items","list_item":"Item da Lista","heading_title":"Título","heading_text":"Título","hr_title":"Barra horizontal","help":"Ajuda de Edição Markdown","toggler":"esconder ou exibir o painel de composição","modal_ok":"OK","modal_cancel":"Cancelar","cant_send_pm":"Desculpe, não pode enviar uma mensagem para %{username}.","admin_options_title":"Configurações opcionais do pessoal para este tópico","auto_close":{"label":"Tempo de fecho automático do tópico:","error":"Por favor introduza um valor válido.","based_on_last_post":"Não feche até que a última mensagem do tópico tenha pelo menos este tempo.","all":{"examples":"Insira o número de horas (24), tempo absoluto (17:30) ou um selo temporal (2013-11-22 14:00)."},"limited":{"units":"(# de horas)","examples":"Introduza o número de horas (24)."}}},"notifications":{"title":"notificações de menções de @nome, respostas às suas publicações e tópicos, mensagens, etc","none":"Impossível de carregar as notificações neste momento.","more":"ver notificações antigas","total_flagged":"total de mensagens sinalizadas","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e aceitou o seu convite\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e moveu {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eGanhou '{{description}}'\u003c/p\u003e","alt":{"mentioned":"Mencionado por","quoted":"Citado por","replied":"Respondido","posted":"Publicado por","edited":"Edição da sua mensagem por","liked":"Gostou da sua mensagem","private_message":"Mensagem privada de","invited_to_private_message":"Convidado para uma mensagem privada de","invited_to_topic":"Convidado para um tópico de","invitee_accepted":"Convite aceite por","moved_post":"A sua mensagem foi movida por","linked":"Hiperligação para a sua mensagem","granted_badge":"Distintivo concedido"},"popup":{"mentioned":"{{username}} mencionou-o em \"{{topic}}\" - {{site_title}}","quoted":"{{username}} citou-o em \"{{topic}}\" - {{site_title}}","replied":"{{username}} respondeu-lhe em \"{{topic}}\" - {{site_title}}","posted":"{{username}} publicou em \"{{topic}}\" - {{site_title}}","private_message":"{{username}} enviou-lhe uma mensagem privada em \"{{topic}}\" - {{site_title}}","linked":"{{username}} ligou-se à sua mensagem a partir de \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Adicionar uma imagem","title_with_attachments":"Adicionar uma imagem ou um ficheiro","from_my_computer":"Do meu dispositivo ","from_the_web":"Da internet","remote_tip":"hiperligação para imagem","remote_tip_with_attachments":"hiperligação para imagem ou ficheiro {{authorized_extensions}}","local_tip":"selecionar imagens do seu dispositivo","local_tip_with_attachments":"selecionar imagens ou ficheiros a partir do seu dispositivo {{authorized_extensions}}","hint":"(pode também arrastar o ficheiro para o editor para fazer o carregamento)","hint_for_supported_browsers":"pode também arrastar e largar ou colar imagens no editor","uploading":"A carregar","select_file":"Selecionar Ficheiro","image_link":"hiperligação da imagem irá apontar para"},"search":{"sort_by":"Ordenar por","relevance":"Relevância","latest_post":"Última Mensagem","most_viewed":"Mais Visto","most_liked":"Mais Gostos","select_all":"Selecionar Tudo","clear_all":"Limpar Tudo","result_count":{"one":"1 resultado para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} resultados para \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"title":"pesquisar tópicos, mensagens, utilizadores, ou categorias","no_results":"Não foi encontrado nenhum resultado.","no_more_results":"Mais nenhum resultado encontrado.","search_help":"Procurar ajuda","searching":"A procurar...","post_format":"#{{post_number}} de {{username}}","context":{"user":"Procurar mensagens de @{{username}}","category":"Procurar na categoria \"{{category}}\"","topic":"Pesquisar este tópico","private_messages":"Pesquisar mensagens"}},"hamburger_menu":"ir para outra lista de tópicos ou categorias","new_item":"novo","go_back":"voltar atrás","not_logged_in_user":"página de utilizador com resumo da atividade atual e preferências  ","current_user":"ir para a sua página de utilizador","topics":{"bulk":{"unlist_topics":"Remover Tópicos da Lista","reset_read":"Repor Leitura","delete":"Eliminar Tópicos","dismiss":"Destituir","dismiss_read":"Destituir todos os não lidos","dismiss_button":"Destituir...","dismiss_tooltip":"Destituir apenas novas mensagens ou parar o acompanhamento de tópicos","also_dismiss_topics":"Parar de acompanhar estes tópicos? (Os tópicos deixarão de aparecer no separador de não lidos)","dismiss_new":"Destituir Novo","toggle":"ativar seleção em massa de tópicos","actions":"Ações em Massa","change_category":"Mudar Categoria","close_topics":"Fechar Tópicos","archive_topics":"Arquivar tópicos","notification_level":"Mudar Nível de Notificação","choose_new_category":"Escolha a nova categoria para os tópicos:","selected":{"one":"Selecionou  \u003cb\u003e1\u003c/b\u003e tópico.","other":"Selecionou \u003cb\u003e{{count}}\u003c/b\u003e tópicos."}},"none":{"unread":"Tem tópicos não lidos.","new":"Não tem novos tópicos.","read":"Ainda não leu nenhum tópico.","posted":"Ainda não publicou nenhum tópico.","latest":"Não há tópicos recentes.","hot":"Não há tópicos quentes.","bookmarks":"Ainda não marcou nenhum tópico.","category":"Não há tópicos na categoria {{category}}.","top":"Não existem tópicos recentes.","search":"Não há resultados na pesquisa.","educate":{"new":"\u003cp\u003eOs seus novos tópicos aparecem aqui.\u003c/p\u003e\u003cp\u003ePor defeito, os tópicos são considerados novos e mostrarão o indicador \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003enovo\u003c/span\u003e caso tenham sido criados nos últimos 2 dias.\u003c/p\u003e\u003cp\u003ePode alterar isto nas suas \u003ca href=\"%{userPrefsUrl}\"\u003epreferências\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eOs seus tópicos não lidos aparecem aqui.\u003c/p\u003e\u003cp\u003ePor defeito, os tópicos são considerados não lidos e aparecem nas contagens de não lidos \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e Se:\u003c/p\u003e\u003cul\u003e\u003cli\u003eCriou o tópico\u003c/li\u003e\u003cli\u003eRespondeu ao tópico\u003c/li\u003e\u003cli\u003eLeu o tópico por mais de 4 minutos\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eOu, se definiu explicitamente o tópico para acompanhar ou vigiar através do controlo de notificações que se encontra na parte inferior de cada tópico.\u003c/p\u003e\u003cp\u003e Pode alterar isto nas suas \u003ca href=\"%{userPrefsUrl}\"\u003epreferências\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Não existem mais tópicos recentes.","hot":"Não existem mais tópicos quentes.","posted":"Não existem mais tópicos publicados.","read":"Não existem mais tópicos lidos.","new":"Não existem mais tópicos novos.","unread":"Não existem mais tópicos não lidos.","category":"Não existem mais tópicos na categoria {{category}}.","top":"Não existem mais tópicos recentes.","bookmarks":"Não há mais tópicos marcados.","search":"Não há mais resultados na pesquisa."}},"topic":{"unsubscribe":{"stop_notifications":"Irá passar a receber menos notificações para \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"O seu estado de notificação atual é"},"filter_to":"{{post_count}} mensagens no tópico","create":"Novo Tópico","create_long":"Criar um novo Tópico","private_message":"Iniciar uma mensagem","list":"Tópicos","new":"novo tópico","unread":"não lido","new_topics":{"one":"1 novo tópico","other":"{{count}} novos tópicos."},"unread_topics":{"one":"1 tópico não lido","other":"{{count}} tópicos não lidos"},"title":"Tópico","invalid_access":{"title":"O tópico é privado","description":"Pedimos desculpa, mas não tem acesso a esse tópico!","login_required":"Necessita de iniciar sessão para ver este tópico."},"server_error":{"title":"Falha ao carregar tópico","description":"Pedimos desculpa, não conseguimos carregar esse tópico, possivelmente devido a um problema na conexão. Por favor teste novamente. Se o problema persistir, avise-nos."},"not_found":{"title":"Tópico não encontrado","description":"Pedimos desculpa, não foi possível encontrar esse tópico. Talvez tenha sido removido por um moderador?"},"total_unread_posts":{"one":"tem 1 mensagem não lido neste tópico","other":"tem {{count}} mensagens não lidas neste tópico"},"unread_posts":{"one":"tem 1 mensagem antiga não lida neste tópico","other":"tem {{count}} mensagens antigas não lidas neste tópico"},"new_posts":{"one":"existe 1 nova mensagem neste tópico desde a sua última leitura","other":"existem {{count}} novas mensagens neste tópico desde a sua última leitura"},"likes":{"one":"existe 1 gosto neste tópico","other":"existem {{count}} gostos neste tópico"},"back_to_list":"Voltar à lista de Tópicos","options":"Opções do Tópico","show_links":"mostrar hiperligações dentro deste tópico","toggle_information":"alternar detalhes do tópico","read_more_in_category":"Pretende ler mais? Procure outros tópicos em {{catLink}} ou {{latestLink}}.","read_more":"Pretende ler mais? {{catLink}} ou {{latestLink}}.","browse_all_categories":"Pesquisar em todas as categorias","view_latest_topics":"ver os tópicos mais recentes","suggest_create_topic":"Porque não começar um tópico?","jump_reply_up":"avançar para resposta mais recente","jump_reply_down":"avançar para resposta mais antiga","deleted":"Este tópico foi eliminado","auto_close_notice":"Este tópico vai ser automaticamente encerrado em %{timeLeft}.","auto_close_notice_based_on_last_post":"Este tópico será encerrado %{duration} depois da última resposta","auto_close_title":"Configurações para Fechar Automaticamente","auto_close_save":"Guardar","auto_close_remove":"Não Fechar Este Tópico Automaticamente","progress":{"title":"progresso do tópico","go_top":"topo","go_bottom":"fim","go":"ir","jump_bottom":"saltar para a última mensagem","jump_bottom_with_number":"avançar para a mensagem %{post_number}","total":"total de mensagens","current":"mensagem atual","position":"mensagem %{current} de %{total}"},"notifications":{"reasons":{"3_6":"Receberá notificações porque está a vigiar esta categoria.","3_5":"Receberá notificações porque começou a vigiar automaticamente este tópico.","3_2":"Receberá notificações porque está a vigiar este tópico.","3_1":"Receberá notificações porque criou este tópico.","3":"Receberá notificações porque está a vigiar este tópico.","2_8":"Receberá notificações porque está a acompanhar esta categoria.","2_4":"Receberá notificações porque publicou uma resposta a este tópico.","2_2":"Receberá notificações porque está a acompanhar este tópico.","2":"Receberá notificações porque \u003ca href=\"/users/{{username}}/preferences\"\u003eleu este tópico\u003c/a\u003e.","1_2":"Será notificado se alguém mencionar o seu @nome ou responder-lhe.","1":"Será notificado se alguém mencionar o seu @nome ou responder-lhe.","0_7":"Está a ignorar todas as notificações nesta categoria.","0_2":"Está a ignorar todas as notificações para este tópico.","0":"Está a ignorar todas as notificações para este tópico."},"watching_pm":{"title":"A vigiar","description":"Será notificado de cada nova resposta nesta mensagem, e uma contagem de novas respostas será exibida."},"watching":{"title":"A vigiar","description":"Será notificado de cada nova resposta neste tópico, e uma contagem de novas respostas será exibida."},"tracking_pm":{"title":"Acompanhar","description":"Uma contagem de novas respostas será exibida para esta mensagem. Será notificado se alguém mencionar o seu @nome ou responder-lhe."},"tracking":{"title":"Acompanhar","description":"Uma contagem de novas respostas será exibida para este tópico. Será notificado se alguém mencionar o seu @nome ou responder-lhe."},"regular":{"title":"Habitual","description":"Será notificado se alguém mencionar o seu @nome ou responder-lhe."},"regular_pm":{"title":"Habitual","description":"Será notificado se alguém mencionar o seu @nome ou responder-lhe."},"muted_pm":{"title":"Silenciado","description":"Não será notificado de nada relacionado com esta mensagem."},"muted":{"title":"Silenciado","description":"Nunca será notificado de nada acerca deste tópico, e este não irá aparecer nos recentes."}},"actions":{"recover":"Recuperar Tópico","delete":"Eliminar Tópico","open":"Abrir Tópico","close":"Fechar Tópico","multi_select":"Selecionar Mensagens...","auto_close":"Fechar Automaticamente...","pin":"Fixar Tópico...","unpin":"Desafixar Tópico...","unarchive":"Desarquivar Tópico","archive":"Arquivar Tópico","invisible":"Tornar Não Listado","visible":"Tornar Listado","reset_read":"Repor Data de Leitura"},"feature":{"pin":"Fixar Tópico","unpin":"Desafixar Tópico","pin_globally":"Fixar Tópico Globalmente","make_banner":"Tópico de Faixa","remove_banner":"Remover Tópico de Faixa"},"reply":{"title":"Responder","help":"começa a compor uma resposta a este tópico"},"clear_pin":{"title":"Remover destaque","help":"Remover destaque deste tópico para que o mesmo deixe de aparecer no topo da sua lista de tópicos"},"share":{"title":"Partilhar","help":"Partilhar uma hiperligação para este tópico"},"flag_topic":{"title":"Sinalizar","help":"sinalizar privadamente este tópico para consideração ou enviar uma notificação privada sobre o mesmo","success_message":"Sinalizou este tópico com sucesso."},"feature_topic":{"title":"Destacar este tópico","pin":"Fazer este tópico aparecer no topo da categoria {{categoryLink}} até","confirm_pin":"Já tem {{count}} tópicos fixados. Demasiados tópicos fixados podem ser um fardo para utilizadores novos e anónimos. Tem a certeza que deseja fixar outro tópico nesta categoria?","unpin":"Remover este tópico do topo da categoria {{categoryLink}}.","unpin_until":"Remover este tópico do topo da categoria {{categoryLink}} ou espere até \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Os utilizadores podem desafixar individualmente o tópico por si próprios.","pin_validation":"É necessária uma data para fixar este tópico.","not_pinned":"Não há tópicos fixados em {{categoryLink}}.","already_pinned":{"one":"Tópicos atualmente fixados em {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Tópicos atualmente fixados em {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Fazer com que este tópico apareça no topo da lista de todos os tópicos até","confirm_pin_globally":"Já tem {{count}} tópicos fixados globalmente. Demasiados tópicos fixados podem ser um fardo para utilizadores novos e anónimos. Tem a certeza que deseja fixar outro tópico globalmente?","unpin_globally":"Remover este tópico do topo de todas as listas de tópicos.","unpin_globally_until":"Remover este tópico do topo da lista de todos os tópicos ou espere até \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Os utilizadores podem desafixar individualmente o tópico por si próprios.","not_pinned_globally":"Não existem tópicos fixados globalmente.","already_pinned_globally":{"one":"Tópicos atualmente fixados globalmente: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Tópicos atualmente fixados globalmente: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"make_banner":"Tornar este tópico numa faixa que apareça no topo de todas as páginas.","remove_banner":"Remover a faixa que aparece no topo de todas as páginas.","banner_note":"Os utilizadores podem destituir a faixa ao fecharem-na. Apenas um tópico pode ser considerado uma faixa em qualquer momento.","no_banner_exists":"Não existe tópico de faixa.","banner_exists":"\u003cstrong class='badge badge-notification unread'\u003eExiste\u003c/strong\u003e atualmente um tópico de faixa."},"inviting":"A Convidar...","automatically_add_to_groups_optional":"Este convite também inclui acesso a estes grupos: (opcional, apenas Administração)","automatically_add_to_groups_required":"Esse convite também inclui acesso a estes grupos: (\u003cb\u003eObrigatório\u003cb\u003e, apenas Administração)","invite_private":{"title":"Convidar para Mensagem","email_or_username":"Email ou Nome de Utilizador do Convidado","email_or_username_placeholder":"endereço de email ou nome de utilizador","action":"Convidar","success":"Convidámos esse utilizador para participar nesta mensagem.","error":"Pedimos desculpa, ocorreu um erro ao convidar esse utilizador.","group_name":"nome do grupo"},"invite_reply":{"title":"Convidar","username_placeholder":"nome de utilizador","action":"Enviar Convite","help":"convidar outros para este tópico via email ou notificações","to_forum":"Enviaremos um breve email que permitirá ao seu amigo juntar-se imediatamente clicando numa hiperligação, não sendo necessário ter sessão iniciada.","sso_enabled":"Introduza o nome de utilizador da pessoa que gostaria de convidar para este tópico.","to_topic_blank":"Introduza o nome de utilizador ou endereço de email da pessoa que gostaria de convidar para este tópico.","to_topic_email":"Introduziu um endereço de email. Iremos enviar um email com um convite que permite aos seus amigos responderem a este tópico imediatamente.","to_topic_username":"Introduziu um nome de utilizador. Iremos enviar-lhe uma notificação com uma hiperligação convidando-o para este tópico.","to_username":"Introduza o nome de utilizador da pessoa que deseja convidar. Iremos enviar-lhe uma notificação com uma hiperligação convidando-o para este tópico.","email_placeholder":"nome@exemplo.com","success_email":"Enviámos por email um convite para \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Iremos notificá-lo quando o convite for utilizado. Verifique o separador de convites na sua página de utilizador para acompanhar os seus convites.","success_username":"Convidámos esse utilizador para participar neste tópico.","error":"Pedimos desculpa, não conseguimos convidar essa pessoa. Talvez já tenha sido convidado? (Os convites são limitados)"},"login_reply":"Iniciar sessão para Responder","filters":{"n_posts":{"one":"1 mensagem","other":"{{count}} mensagens"},"cancel":"Remover filtro"},"split_topic":{"title":"Mover para um Novo Tópico","action":"mover para um novo tópico","topic_name":"Nome do Novo Tópico","error":"Ocorreu um erro ao mover as mensagens para um novo tópico.","instructions":{"one":"Está prestes a criar um novo tópico e populá-lo com a mensagem que selecionou.","other":"Está prestes a criar um novo tópico e populá-lo com as \u003cb\u003e{{count}}\u003c/b\u003e mensagens que selecionou."}},"merge_topic":{"title":"Mover para Tópico Existente","action":"mover para tópico existente","error":"Ocorreu um erro ao mover as mensagens para esse tópico.","instructions":{"one":"Por favor selecione o tópico para o qual gostaria de mover esta mensagem.","other":"Por favor selecione o tópico para o qual gostaria de mover estas \u003cb\u003e{{count}}\u003c/b\u003e mensagens."}},"change_owner":{"title":"Mudar Proprietário das Mensagens","action":"mudar titularidade","error":"Ocorreu um erro na mudança de titularidade das mensagens.","label":"Novo Proprietário das Mensagens","placeholder":"nome de utilizador do novo proprietário","instructions":{"one":"Por favor seleccione o novo titular da mensagem de \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Por favor selecione o novo titular das {{count}} mensagens de \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Note que quaisquer notificações relacionadas com esta mensagem serão transferidas retroativamente para o novo utilizador. \u003cbr\u003eAviso: Atualmente nenhum dado dependente da mensagem é transferido para o novo utilizador. Usar com cautela."},"change_timestamp":{"title":"Alterar Selo Temporal","action":"alterar selo temporal","invalid_timestamp":"O selo temporal não pode ser no futuro.","error":"Ocorreu um erro ao alterar o selo temporal do tópico.","instructions":"Por favor selecione o novo selo temporal do tópico. Mensagens no tópico serão atualizadas para terem a mesma diferença temporal."},"multi_select":{"select":"selecionar","selected":"({{count}}) selecionados","select_replies":"selecione +respostas","delete":"eliminar selecionados","cancel":"cancelar seleção","select_all":"selecionar tudo ","deselect_all":"desmarcar tudo","description":{"one":"Selecionou \u003cb\u003e1\u003c/b\u003e mensagem.","other":"Selecionou \u003cb\u003e{{count}}\u003c/b\u003e mensagens."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"citar resposta","edit":"Editar {{link}} {{replyAvatar}} {{username}}","edit_reason":"Motivo:","post_number":"mensagem {{number}}","last_edited_on":"mensagem editada pela última vez em","reply_as_new_topic":"Responder com novo Tópico","continue_discussion":"Continuar a discussão desde {{postLink}}:","follow_quote":"avançar para a mensagem citada","show_full":"Mostrar Mensagem Completa","show_hidden":"Ver conteúdo ocultado.","deleted_by_author":{"one":"(mensagens abandonadas pelo autor serão removidas automaticamente em %{count} hora a não ser que estejam sinalizadas)","other":"(mensagens abandonadas pelo autor serão eliminadas automaticamente em %{count} horas a não ser que estejam sinalizadas)"},"expand_collapse":"expandir/colapsar","gap":{"one":"ver 1 resposta oculta","other":"ver {{count}} respostas ocultas"},"more_links":"{{count}} mais...","unread":"Mensagem não lida","has_replies":{"one":"{{count}} Resposta","other":"{{count}} Respostas"},"has_likes":{"one":"{{count}} Gosto","other":"{{count}} Gostos"},"has_likes_title":{"one":"1 pessoa gostou desta mensagem","other":"{{count}} pessoas gostaram desta mensagem"},"has_likes_title_only_you":"você gostou desta mensagem","has_likes_title_you":{"one":"você e 1 outra pessoa gostaram desta mensagem","other":"você e {{count}} outras pessoas gostaram desta mensagem"},"errors":{"create":"Pedimos desculpa, ocorreu um erro ao criar a sua mensagem. Por favor, tente novamente.","edit":"Pedimos desculpa, ocorreu um erro ao editar a sua mensagem. Por favor, tente novamente.","upload":"Pedimos desculpa, ocorreu um erro ao carregar esse ficheiro. Por favor, tente novamente.","attachment_too_large":"Pedimos desculpa, o ficheiro que está a carregar é muito grande (o tamanho máximo permitido é {{max_size_kb}}kb).","file_too_large":"Pedimos desculpa, o ficheiro que está a tentar carregar é muito grande (o tamanho máximo permitido é {{max_size_kb}}kb).","too_many_uploads":"Pedimos desculpa, só pode carregar um ficheiro de cada vez.","too_many_dragged_and_dropped_files":"Pedimos desculpa, só pode arrastar e largar até 10 ficheiros de cada vez.","upload_not_authorized":"Pedimos desculpa, o tipo de ficheiro que está a carregar não está autorizado (extensões autorizadas: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Pedimos desculpa, os novos utilizadores não podem carregar imagens.","attachment_upload_not_allowed_for_new_user":"Pedimos desculpa, os novos utilizadores não podem carregar anexos.","attachment_download_requires_login":"Pedimos desculpa, os novos utilizadores não podem carregar anexos."},"abandon":{"confirm":"Tem a certeza que deseja abandonar a sua mensagem?","no_value":"Não, manter","yes_value":"Sim, abandonar"},"via_email":"esta mensagem chegou por email","whisper":"esta mensagem é um susurro privado para os moderadores","wiki":{"about":"esta mensagem é uma wiki; utilizadores comuns podem editá-la"},"archetypes":{"save":"Guardar as Opções"},"controls":{"reply":"começar a compor uma resposta a este tópico","like":"gostar deste tópico","has_liked":"gostou desta mensagem","undo_like":"desfazer gosto","edit":"editar este tópico","edit_anonymous":"Pedimos desculpa, mas necessita de ter sessão iniciada para editar esta mensagem.","flag":"sinalizar privadamente este tópico para consideração ou enviar uma notificação privada sobre o mesmo","delete":"eliminar esta mensagem","undelete":"repor esta mensagem","share":"partilhar uma hiperligação para esta mensagem","more":"Mais","delete_replies":{"confirm":{"one":"Também quer eliminar a {{count}} resposta direta a esta mensagem?","other":"Também quer eliminar as {{count}} respostas diretas a esta mensagem?"},"yes_value":"Sim, eliminar as respostas também","no_value":"Não, somente esta mensagem"},"admin":"ações administrativas de mensagens","wiki":"Fazer Wiki","unwiki":"Remover Wiki","convert_to_moderator":"Adicionar Cor do Pessoal","revert_to_regular":"Remover Cor do Pessoal","rebake":"Reconstruir HTML","unhide":"Mostrar","change_owner":"Mudar Titularidade"},"actions":{"flag":"Sinalizar","defer_flags":{"one":"Diferir sinalização","other":"Diferir sinalizações"},"it_too":{"off_topic":"Sinalizar também","spam":"Sinalizar também","inappropriate":"Sinalizar também","custom_flag":"Sinalizar também","bookmark":"Também adicionar marcador","like":"Também adicionar um Gosto","vote":"Também adicionar um voto"},"undo":{"off_topic":"Retirar sinalização","spam":"Retirar sinalização","inappropriate":"Retirar sinalização","bookmark":"Remover marcador","like":"Retirar gosto","vote":"Retirar voto"},"people":{"off_topic":"{{icons}} sinalizou isto como fora de contexto","spam":"{{icons}} sinalizou isto como spam","spam_with_url":"{{icons}} sinalizaram \u003ca href='{{postUrl}}'\u003eisto como spam\u003c/a\u003e","inappropriate":"{{icons}} sinalizou isto como inapropriado","notify_moderators":"{{icons}} moderadores notificados","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003emoderadores notificados\u003c/a\u003e","notify_user":"{{icons}} enviou uma mensagem","notify_user_with_url":"{{icons}} enviou uma \u003ca href='{{postUrl}}'\u003emensagem\u003c/a\u003e","bookmark":"{{icons}} adicionaram um marcador a isto","like":"{{icons}} gostaram disto","vote":"{{icons}} votaram nisto"},"by_you":{"off_topic":"Sinalizou isto como fora de contexto","spam":"Sinalizou isto como spam","inappropriate":"Sinalizou isto como inapropriado","notify_moderators":"Sinalizou isto para moderação","notify_user":"Enviou uma mensagem a este utilizador","bookmark":"Adicionou um marcador a esta mensagem","like":"Gostou disto","vote":"Votou nesta mensagem"},"by_you_and_others":{"off_topic":{"one":"Para além de si, 1 pessoa sinalizou isto como fora de contexto","other":"Para além de si, {{count}} pessoas sinalizaram isto como fora de contexto"},"spam":{"one":"Para além de si, 1 pessoa sinalizou isto como spam","other":"Para além de si, {{count}} pessoas sinalizaram isto como spam"},"inappropriate":{"one":"Para além de si, 1 pessoa sinalizou isto como inapropriado","other":"Para além de si, {{count}} pessoas sinalizaram isto como inapropriado"},"notify_moderators":{"one":"Para além de si, 1 pessoa sinalizaram isto para moderação","other":"Para além de si, {{count}} pessoas sinalizaram isto para moderação"},"notify_user":{"one":"Para além de si, 1 outro utilizador enviaram uma mensagem a este utilizador","other":"Para além de si, {{count}} outros utilizadores enviaram uma mensagem a este utilizador"},"bookmark":{"one":"Para além de si, 1 pessoa adicionou um marcador a esta mensagem","other":"Para além de si, {{count}} adicionaram um marcador a esta mensagem"},"like":{"one":"Para além de si, 1 pessoa gostou disto","other":"Para além de si, {{count}} pessoas gostaram disto"},"vote":{"one":"Para além de si, 1 pessoa votou nesta mensagem","other":"Para além de si, {{count}} pessoas votaram nesta mensagem"}},"by_others":{"off_topic":{"one":"1 pessoa sinalizou isto como fora de contexto","other":"{{count}} pessoas sinalizaram isto como fora de contexto"},"spam":{"one":"1 pessoa sinalizou isto como spam","other":"{{count}} pessoas sinalizaram isto como spam"},"inappropriate":{"one":"1 pessoa sinalizou isto como impróprio","other":"{{count}} pessoas sinalizaram isto como inapropriado"},"notify_moderators":{"one":"1 pessoa sinalizou isto para moderação","other":"{{count}} pessoas sinalizaram isto para moderação"},"notify_user":{"one":"1 pessoa enviou uma mensagem a este utilizador","other":"{{count}} enviaram uma mensagem a este utilizador"},"bookmark":{"one":"1 pessoa adicionou um marcador a esta mensagem","other":"{{count}} pessoas adicionaram um marcador a esta mensagem"},"like":{"one":"1 pessoa gostou disto","other":"{{count}} pessoas gostaram disto"},"vote":{"one":"1 pessoa votou nesta mensagem","other":"{{count}} pessoas votaram nesta mensagem"}}},"delete":{"confirm":{"one":"Tem a certeza que quer eliminar essa mensagem?","other":"Tem a certeza que quer eliminar todas essas mensagens?"}},"revisions":{"controls":{"first":"Primeira revisão","previous":"Revisão anterior","next":"Próxima revisão","last":"Última revisão","hide":"Esconder revisão","show":"Mostrar revisão","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Mostrar o resultado renderizado com inserções e remoções em-linha.","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Mostrar o resultado renderizado das diferenças lado-a-lado","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Mostrar em bruto a fonte das diferenças lado-a-lado","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Em bruto"}}}},"category":{"can":"pode\u0026hellip; ","none":"(sem categoria)","all":"Todas as categorias","choose":"Selecione uma category\u0026hellip;","edit":"editar","edit_long":"Editar","view":"Visualizar Tópicos na Categoria","general":"Geral","settings":"Configurações","topic_template":"Modelo do Tópico","delete":"Eliminar Categoria","create":"Nova Categoria","create_long":"Criar uma nova categoria","save":"Guardar Categoria","slug":"Título da Categoria","slug_placeholder":"(Opcional) palavras com travessão no URL","creation_error":"Ocorreu um erro durante a criação da categoria.","save_error":"Ocorreu um erro ao guardar a categoria.","name":"Nome da Categoria","description":"Descrição","topic":"tópico da categoria","logo":"Logótipo da Categoria","background_image":"Imagem de Fundo da Categoria","badge_colors":"Cores do distintivo","background_color":"Cor de fundo","foreground_color":"Cor frontal","name_placeholder":"Máximo de uma ou duas palavras","color_placeholder":"Qualquer cor da internet","delete_confirm":"Tem a certeza que deseja eliminar esta categoria?","delete_error":"Ocorreu um erro ao eliminar a categoria.","list":"Lista de Categorias","no_description":"Por favor adicione uma descrição para esta categoria.","change_in_category_topic":"Editar Descrição","already_used":"Esta cor já foi usada para outra categoria","security":"Segurança","special_warning":"Aviso: Esta categoria é uma categoria pré-preenchida e as configurações de segurança não podem ser editadas. Se não deseja utilizar esta categoria, elimine-a em vez de lhe dar um novo propósito.","images":"Imagens","auto_close_label":"Fechar tópicos automaticamente depois de:","auto_close_units":"horas","email_in":"Endereço de email personalizado para emails recebidos:","email_in_allow_strangers":"Aceitar emails de utilizadores anónimos sem conta","email_in_disabled":"Publicar novos tópicos através do email está desactivado nas Configurações do Sítio. Para permitir a publicação de novos tópicos através do email,","email_in_disabled_click":"ative a definição \"email em\".","contains_messages":"Modificar esta categoria para conter apenas mensagens.","suppress_from_homepage":"Suprimir esta categoria da página principal.","allow_badges_label":"Permitir a atribuição de distintivos nesta categoria","edit_permissions":"Editar Permissões","add_permission":"Adicionar Permissões","this_year":"este ano","position":"posição","default_position":"Posição Padrão","position_disabled":"As categorias serão exibidas por ordem de actividade. Para controlar a ordenação das categorias nas listas,","position_disabled_click":"ative a definição \"categoria em posição fixa\".","parent":"Categoria Principal","notifications":{"watching":{"title":"A vigiar","description":"Irá vigiar automaticamente todos os novos tópicos nestas categorias. Irá ser notificado de cada nova mensagem em cada tópico, e uma contagem de novas respostas será exibida."},"tracking":{"title":"Acompanhar","description":"Irá acompanhar automaticamente todos os novos tópicos nestas categorias. Irá ser notificado se alguém mencionar o seu @nome ou lhe responder, e uma contagem de novas respostas será exibida."},"regular":{"title":"Normal","description":"Será notificado se alguém mencionar o seu @nome ou responder-lhe."},"muted":{"title":"Silenciado","description":"Nunca será notificado de nada acerca de novos tópicos nestas categorias, e estes não irão aparecer nos recentes."}}},"flagging":{"title":"Obrigado por ajudar a manter a nossa comunidade cívica!","private_reminder":"as sinalizações são privadas, visíveis \u003cb\u003eapenas\u003c/b\u003e para o pessoal","action":"Sinalizar Mensagem","take_action":"Acionar","notify_action":"Mensagem","delete_spammer":"Eliminar Spammer","delete_confirm":"Está prestes a apagar \u003cb\u003e%{posts}\u003c/b\u003e mensagens e \u003cb\u003e%{topics}\u003c/b\u003e tópicos deste utilizador, remover a sua conta, bloquear acessos do seu endereço IP \u003cb\u003e%{ip_address}\u003c/b\u003e, e adicionar o seu endereço de email \u003cb\u003e%{email}\u003c/b\u003e a uma lista negra. Tem a certeza que este utilizador é de facto um spammer?","yes_delete_spammer":"Sim, Eliminar Spammer","ip_address_missing":"(N/A)","hidden_email_address":"(escondido)","submit_tooltip":"Submeter a sinalização privada","take_action_tooltip":"Atingir imediatamente o limite de sinalizações, em vez de esperar por mais denúncias da comunidade","cant":"Pedimos desculpa, não é possível colocar uma sinalização nesta mensagem neste momento.","notify_staff":"Notificar Pessoal","formatted_name":{"off_topic":"Está fora do contexto","inappropriate":"É inapropriado","spam":"É Spam"},"custom_placeholder_notify_user":"Seja específico, seja construtivo e seja sempre amável.","custom_placeholder_notify_moderators":"Diga-nos especificamente quais são as suas preocupações, e forneça-nos hiperligações relevantes e exemplo se possível.","custom_message":{"at_least":"insira pelo menos {{n}} caracteres","more":"{{n}} em falta...","left":"{{n}} remanescentes"}},"flagging_topic":{"title":"Obrigado por ajudar a manter a nossa comunidade cívica!","action":"Sinalizar Tópico","notify_action":"Mensagem"},"topic_map":{"title":"Sumário do Tópico","participants_title":"Autores Frequentes","links_title":"Hiperligações Populares","links_shown":"mostrar todas as {{totalLinks}} hiperligações...","clicks":{"one":"1 clique","other":"%{count} cliques"}},"topic_statuses":{"warning":{"help":"Este é um aviso oficial."},"bookmarked":{"help":"Adicionou este tópico aos marcadores"},"locked":{"help":"Este tópico está fechado; já não são aceites novas respostas"},"archived":{"help":"Este tópico está arquivado; está congelado e não pode ser alterado"},"locked_and_archived":{"help":"Este tópico está fechado e arquivado; já não aceita novas respostas e não pode ser modificado"},"unpinned":{"title":"Desafixado","help":"Este tópico foi desafixado por si; será mostrado na ordem habitual"},"pinned_globally":{"title":"Fixado Globalmente","help":"Este tópico está fixado globalmente; será exibido no topo dos recentes e da sua categoria"},"pinned":{"title":"Fixado","help":"Este tópico foi fixado por si; será mostrado no topo da sua categoria"},"invisible":{"help":"Este tópico não está listado; não será apresentado na lista de tópicos e poderá ser acedido apenas através de uma hiperligação direta"}},"posts":"Mensagens","posts_lowercase":"mensagens","posts_long":"existem {{number}} mensagens neste tópico","original_post":"Mensagem Original","views":"Visualizações","views_lowercase":{"one":"visualização","other":"visualizações"},"replies":"Respostas","views_long":"este tópico foi visto {{number}} vezes","activity":"Atividade","likes":"Gostos","likes_lowercase":{"one":"gosto","other":"gostos"},"likes_long":"existem {{number}} gostos neste tópico","users":"Utilizadores","users_lowercase":{"one":"utilizador","other":"utilizadores"},"category_title":"Categoria","history":"Histórico","changed_by":"por {{author}}","raw_email":{"title":"Email em bruto","not_available":"Indisponível!"},"categories_list":"Lista de Categorias","filters":{"with_topics":"%{filter} tópicos","with_category":"%{filter} %{category} tópicos","latest":{"title":"Recente","title_with_count":{"one":"Recente (1)","other":"Recentes ({{count}})"},"help":"tópicos com mensagens recentes"},"hot":{"title":"Quente","help":"uma seleção dos tópicos mais quentes"},"read":{"title":"Lido","help":"tópicos que leu, na ordem que os leu"},"search":{"title":"Pesquisar","help":"pesquisar todos os tópicos"},"categories":{"title":"Categorias","title_in":"Categoria - {{categoryName}}","help":"todos os tópicos agrupados por categoria"},"unread":{"title":"Não Lido","title_with_count":{"one":"Não Lido (1)","other":"Não Lidos ({{count}})"},"help":"tópicos que está atualmente a vigiar ou a acompanhar com mensagens não lidas","lower_title_with_count":{"one":"1 não lido","other":"{{count}} não lidos"}},"new":{"lower_title_with_count":{"one":"1 novo","other":"{{count}} novos"},"lower_title":"novo","title":"Novo","title_with_count":{"one":"Novo (1)","other":"Novos ({{count}})"},"help":"tópicos criados nos últimos dias"},"posted":{"title":"As Minhas mensagens","help":"tópicos nos quais publicou uma mensagem"},"bookmarks":{"title":"Marcadores","help":"tópicos que marcou"},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"},"help":"tópicos recentes na categoria {{categoryName}}"},"top":{"title":"Os Melhores","help":"os tópicos mais ativos no último ano, mês, semana ou dia","all":{"title":"Em Qualquer Altura"},"yearly":{"title":"Anual"},"quarterly":{"title":"Trimestral"},"monthly":{"title":"Mensal"},"weekly":{"title":"Semanal"},"daily":{"title":"Diário"},"all_time":"Em Qualquer Altura","this_year":"Ano","this_quarter":"Trimestre","this_month":"Mês","this_week":"Semana","today":"Hoje","other_periods":"ver topo"}},"browser_update":"Infelizmente, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eo seu navegador é demasiado antigo para funcionar com este sítio\u003c/a\u003e. Por favor \u003ca href=\"http://browsehappy.com\"\u003eatualize o seu navegador\u003c/a\u003e.","permission_types":{"full":"Criar / Responder / Ver","create_post":"Responder / Ver","readonly":"Ver"},"poll":{"voters":{"one":"eleitor","other":"eleitores"},"total_votes":{"one":"total da votação","other":"total de votos"},"average_rating":"Classificação média: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"one":"Deve escolher pelo menos \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Deve escolher pelo menos \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"up_to_max_options":{"one":"Pode escolher até \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Pode escolher até \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"x_options":{"one":"Deve escolher \u003cstrong\u003e1\u003c/strong\u003e opção.","other":"Deve escolher \u003cstrong\u003e%{count}\u003c/strong\u003e opções."},"between_min_and_max_options":"Pode escolher entre  \u003cstrong\u003e%{min}\u003c/strong\u003e e \u003cstrong\u003e%{max}\u003c/strong\u003e opções."}},"cast-votes":{"title":"Votar","label":"Vote agora!"},"show-results":{"title":"Exibir resultados da votação","label":"Mostrar resultados"},"hide-results":{"title":"Voltar aos meus votos","label":"Ocultar resultados"},"open":{"title":"Abrir a votação","label":"Abrir","confirm":"Tem a certeza que quer abrir esta votação?"},"close":{"title":"Fechar a votação","label":"Fechar","confirm":"Tem a certeza que quer fechar esta votação?"},"error_while_toggling_status":"Ocorreu um erro ao alternar o estado desta votação.","error_while_casting_votes":"Ocorreu um erro enquanto os seus votos eram enviados."},"type_to_filter":"digite para filtrar...","admin":{"title":"Administração Discourse","moderator":"Moderador","dashboard":{"title":"Painel de Administração","last_updated":"Painel atualizado em:","version":"Versão","up_to_date":"Está atualizado!","critical_available":"Uma atualização crítica está disponível.","updates_available":"Há atualizações disponíveis.","please_upgrade":"Por favor, atualize!","no_check_performed":"Não foi feita nenhuma verificação por atualizações. Certifique-se que o sidekiq está em execução.","stale_data":"Não foi feita verificação por atualizações ultimamente. Certifique-se de que o sidekiq está em execução.","version_check_pending":"Parece que atualizou recentemente. Fantástico!","installed_version":"Instalado","latest_version":"Recentes","problems_found":"Foram encontrados alguns problemas na sua instalação do Discourse:","last_checked":"Última verificação","refresh_problems":"Atualizar","no_problems":"Nenhum problema encontrado.","moderators":"Moderadores:","admins":"Administradores:","blocked":"Bloqueado:","suspended":"Suspenso: ","private_messages_short":"Msgs","private_messages_title":"Mensagens","mobile_title":"Móvel","space_free":"{{size}} livre","uploads":"carregamentos","backups":"fazer cópias de segurança","traffic_short":"Tráfego","traffic":"Pedidos de aplicação web","page_views":"Pedidos API","page_views_short":"Pedidos API","show_traffic_report":"Mostrar Relatório Detalhado do Tráfego","reports":{"today":"Hoje","yesterday":"Ontem","last_7_days":"Últimos 7 Dias","last_30_days":"Últimos 30 Dias","all_time":"Desde Sempre","7_days_ago":"7 Dias Atrás","30_days_ago":"30 Dias Atrás","all":"Tudo","view_table":"tabela","view_chart":"gráfico de barras","refresh_report":"Atualizar relatório","start_date":"Data de Início","end_date":"Data final"}},"commits":{"latest_changes":"Últimas alterações: atualize com frequência!","by":"por"},"flags":{"title":"Sinalizações","old":"Antigo","active":"Ativo","agree":"Aceitar","agree_title":"Confirmar esta sinalização como válida e correta","agree_flag_modal_title":"Aceitar e...","agree_flag_hide_post":"Aceitar (esconder mensagem + enviar MP)","agree_flag_hide_post_title":"Esconder esta publicação e enviar automaticamente uma mensagem ao utilizador solicitando a edição urgente da mesma","agree_flag_restore_post":"Concordar (restaurar mensagem)","agree_flag_restore_post_title":"Restaurar esta mensagem","agree_flag":"Concordar com a sinalização","agree_flag_title":"Concordar com a sinalização e manter a mensagem inalterada","defer_flag":"Diferir","defer_flag_title":"Remover esta sinalização; não requer qualquer ação de momento.","delete":"Eliminar","delete_title":"Eliminar a mensagem associada a esta sinalização.","delete_post_defer_flag":"Eliminar mensagem e diferir a sinalização.","delete_post_defer_flag_title":"Eliminar mensagem; se é a primeira do tópico então eliminar o tópico","delete_post_agree_flag":"Eliminar mensagem e Concordar com a sinalização","delete_post_agree_flag_title":"Eliminar mensagem; se é a primeira do tópico então eliminar o tópico","delete_flag_modal_title":"Eliminar e…","delete_spammer":"Eliminar Spammer","delete_spammer_title":"Remover utilizador e todos as mensagens e tópicos do mesmo.","disagree_flag_unhide_post":"Discordar (exibir mensagem)","disagree_flag_unhide_post_title":"Remover qualquer sinalização desta mensagem e torná-la visível novamente","disagree_flag":"Discordar","disagree_flag_title":"Negar esta sinalização como inválida ou incorreta","clear_topic_flags":"Concluído","clear_topic_flags_title":"Este tópico foi investigado e os problemas foram resolvidos. Clique em Concluído para remover as sinalizações.","more":"(mais respostas...)","dispositions":{"agreed":"concordado","disagreed":"discordado","deferred":"diferido"},"flagged_by":"Sinalizado por","resolved_by":"Resolvido por","took_action":"Realizou uma ação","system":"Sistema","error":"Aconteceu um erro","reply_message":"Responder","no_results":"Não há sinalizações.","topic_flagged":"Este \u003cstrong\u003etópico\u003c/strong\u003e foi sinalizado.","visit_topic":"Visitar tópico para acionar medidas","was_edited":"A mensagem foi editada após a primeira sinalização","previous_flags_count":"Esta mensagem já foi sinalizada {{count}} vezes.","summary":{"action_type_3":{"one":"fora do contexto","other":"fora do contexto x{{count}}"},"action_type_4":{"one":"inapropriado","other":"inapropriado x{{count}}"},"action_type_6":{"one":"personalizado","other":"personalizado x{{count}}"},"action_type_7":{"one":"personalizado","other":"personalizado x{{count}}"},"action_type_8":{"one":"spam","other":"spam x{{count}}"}}},"groups":{"primary":"Grupo Primário","no_primary":"(nenhum grupo primário)","title":"Grupos","edit":"Editar Grupos","refresh":"Atualizar","new":"Novo","selector_placeholder":"insira o nome de utilizador","name_placeholder":"Nome do grupo, sem espaços, com as mesmas regras do nome de utilizador","about":"Editar aqui a sua participação e nomes no grupo","group_members":"Membros do grupo","delete":"Eliminar","delete_confirm":"Eliminar este grupo?","delete_failed":"Impossível eliminar grupo. Se se trata de um grupo automático, não pode ser eliminado.","delete_member_confirm":"Remova o '%{username}' do grupo '%{group}'?","delete_owner_confirm":"Remover privilégios do proprietário para '%{username}'?","name":"Nome","add":"Adicionar","add_members":"Adicionar membros","custom":"Personalizar","bulk_complete":"Os utilizadores foram adicionados ao grupo.","bulk":"Adicionar ao Grupo em Massa","bulk_paste":"Colar uma lista de nomes de utilizador ou emails, um por linha:","bulk_select":"(selecionar um grupo)","automatic":"Automático","automatic_membership_email_domains":"Utilizadores que registem um domínio de email que corresponde exactamente a algum desta lista irão ser automaticamente adicionados a este grupo:","automatic_membership_retroactive":"Aplicar a mesma regra de domínio de email para adicionar utilizadores registados existentes","default_title":"Título padrão para todos os utilizadores neste grupo","primary_group":"Definir automaticamente como grupo primário","group_owners":"Proprietários","add_owners":"Adicionar proprietários"},"api":{"generate_master":"Gerar Chave Mestra API ","none":"Não existem chaves API ativas neste momento.","user":"Utilizador","title":"API","key":"Chave API","generate":"Gerar","regenerate":"Regenerar","revoke":"Revogar","confirm_regen":"Tem a certeza que quer substituir essa chave API por uma nova?","confirm_revoke":"Tem a certeza que quer revogar essa chave?","info_html":"A sua chave API permitirá a criação e edição de tópicos usando pedidos JSON.","all_users":"Todos os Utilizadores","note_html":"Manter esta chave \u003cstrong\u003esecreta\u003c/strong\u003e, todos os utilizadores que a tenham poderão criar mensagens arbitrárias como qualquer utilizador."},"plugins":{"title":"Plugins","installed":"Plugins Instalados","name":"Nome","none_installed":"Não tem nenhum plugin instalado.","version":"Versão","enabled":"Ativado?","is_enabled":"S","not_enabled":"N","change_settings":"Alterar Configurações","change_settings_short":"Configurações","howto":"Como instalo plugins?"},"backups":{"title":"Fazer Cópias de Segurança","menu":{"backups":"Fazer Cópias de Segurança","logs":"Logs"},"none":"Nenhuma cópia de segurança disponível.","read_only":{"enable":{"title":"Ativar o modo só de leitura","label":"Ativar modo só de leitura","confirm":"Tem a certeza que quer ativar o modo só de leitura?"},"disable":{"title":"Desativar o modo só de leitura","label":"Desativar modo só de leitura"}},"logs":{"none":"Nenhuns logs ainda..."},"columns":{"filename":"Nome do ficheiro","size":"Tamanho"},"upload":{"label":"Carregar","title":"Carregar uma cópia de segurança para esta instância","uploading":"A carregar…","success":"'{{filename}}' foi carregado com sucesso.","error":"Verificou-se um erro no carregamento de '{{filename}}': {{message}}"},"operations":{"is_running":"Existe atualmente uma operação em execução...","failed":"A {{operation}} falhou. Por favor verifique o registo dos logs.","cancel":{"label":"Cancelar","title":"Cancelar a operação atual","confirm":"Tem a certeza que deseja cancelar a operação atual?"},"backup":{"label":"Fazer Cópia de segurança","title":"Criar uma cópia de segurança","confirm":"Deseja criar uma nova cópia de segurança?","without_uploads":"Sim (não incluir ficheiros)"},"download":{"label":"Descarregar","title":"Descarregar a cópia de segurança"},"destroy":{"title":"Remover a cópia de segurança","confirm":"Tem a certeza que deseja destruir esta cópia de segurança?"},"restore":{"is_disabled":"A opção de restauro encontra-se desativada nas configurações do sítio.","label":"Restaurar","title":"Restaurar a cópia de segurança","confirm":"Tem a certeza que deseja restaurar esta cópia de segurança?"},"rollback":{"label":"Reverter","title":"Reverter a base de dados para um estado anterior operacional","confirm":"Tem a certeza que deseja reverter a base de dados para um estado anterior operacional?"}}},"export_csv":{"user_archive_confirm":"Tem a certeza que deseja descarregar as suas mensagens?","success":"Exportação iniciada, será notificado através de mensagem assim que o processo estiver concluído.","failed":"A exportação falhou. Por favor verifique os registos dos logs.","rate_limit_error":"As mensagens podem ser descarregadas uma vez por dia. Por favor, tente novamente amanhã.","button_text":"Exportar","button_title":{"user":"Exportar lista total de utilizadores em formato CSV.","staff_action":"Exportar registo total das acções de início de sessão do pessoal em formato CSV.","screened_email":"Exportar lista total de emails selecionados em formato CSV.","screened_ip":"Exportar lista total de IP selecionados em formato CSV.","screened_url":"Exportar lista total de URL selecionados em formato CSV."}},"export_json":{"button_text":"Exportar"},"invite":{"button_text":"Enviar Convites","button_title":"Enviar Convites"},"customize":{"title":"Personalizar","long_title":"Personalizações do Sítio","css":"CSS","header":"Cabeçalho","top":"Topo","footer":"Rodapé","embedded_css":"CSS incorporado","head_tag":{"text":"\u003c/head\u003e","title":"HTML que será introduzido antes da tag \u003c/head\u003e"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML que será introduzido antes da tag \u003c/body\u003e"},"override_default":"Não incluir a folha de estilo por defeito","enabled":"Ativado?","preview":"pré-visualização","undo_preview":"remover pré-visualização","rescue_preview":"estilo por defeito","explain_preview":"Ver o sítio com esta folha de estilo personalizada","explain_undo_preview":"Voltar atrás para a atual folha de estilo personalizada ativa","explain_rescue_preview":"Ver o sítio com a folha de estilo por defeito","save":"Guardar","new":"Novo","new_style":"Novo Estilo","import":"Importar","import_title":"Selecione um ficheiro ou cole texto","delete":"Eliminar","delete_confirm":"Remover esta personalização?","about":"Modificar folha de estilo CSS e cabeçalhos HTML no sítio. Adicionar personalização para iniciar.","color":"Cor","opacity":"Opacidade","copy":"Copiar","email_templates":{"title":"Modelos de Email","subject":"Assunto","body":"Corpo","none_selected":"Selecione um modelo de email para começar a editar.","revert":"Reverter Alterações","revert_confirm":"Tem a certeza que quer reverter as suas alterações?"},"css_html":{"title":"CSS/HTML","long_title":"Personalizações CSS e HTML"},"colors":{"title":"Cores","long_title":"Esquemas de Cores","about":"Modificar as cores usadas no sítio sem escrever CSS. Adicionar um esquema para iniciar.","new_name":"Novo Esquema de Cores","copy_name_prefix":"Cópia de","delete_confirm":"Apagar este esquema de cor?","undo":"desfazer","undo_title":"Desfazer as alterações a esta cor desde a última gravação.","revert":"reverter","revert_title":"Repor esta cor para o esquema de cor padrão do Discourse.","primary":{"name":"primária","description":"A maioria do texto, ícones, e margens."},"secondary":{"name":"secundária","description":"A principal cor de fundo, e cor do texto de alguns botões."},"tertiary":{"name":"terciária","description":"Hiperligações, alguns botões, notificações, e cores acentuadas."},"quaternary":{"name":"quaternária","description":"Hiperligações de navegação."},"header_background":{"name":"fundo do cabeçalho","description":"Cor de fundo do cabeçalho do sítio."},"header_primary":{"name":"cabeçalho primário","description":"Texto e ícones no cabeçalho do sítio."},"highlight":{"name":"destaque","description":"A cor de fundo de elementos destacados na página, tais como mensagens e tópicos."},"danger":{"name":"perigo","description":"Cor de destaque para ações como apagar mensagens e tópicos."},"success":{"name":"sucesso","description":"Usado para indicar que uma ação foi bem sucedida."},"love":{"name":"amor","description":"A cor do botão 'gosto'."},"wiki":{"name":"wiki","description":"Cor base utilizada para o fundo de mensagens wiki"}}},"email":{"title":"Email","settings":"Configurações","all":"Todos","sending_test":"A enviar Email de teste...","error":"\u003cb\u003eERRO\u003c/b\u003e - %{server_error}","test_error":"Occorreu um problema no envio do email de teste. Por favor verifique novamente as suas definições de email, verifique se o seu host não está a bloquear conexões de email, e tente novamente.","sent":"Enviado","skipped":"Ignorado","sent_at":"Enviado em","time":"Tempo","user":"Utilizador","email_type":"Tipo de Email","to_address":"Endereço Para","test_email_address":"endereço de email para testar","send_test":"Enviar Email de Teste","sent_test":"enviado!","delivery_method":"Método de Entrega","preview_digest":"Pré-visualizar Resumo","preview_digest_desc":"Pré-visualizar o conteúdo dos emails de resumo enviados aos utilizadores inativos.","refresh":"Atualizar","format":"Formato","html":"html","text":"texto","last_seen_user":"Último Utilizador Visto:","reply_key":"Chave de Resposta","skipped_reason":"Ignorar Motivo","logs":{"none":"Nenhuns logs encontrados.","filters":{"title":"Filtrar","user_placeholder":"nome de utilizador","address_placeholder":"nome@exemplo.com","type_placeholder":"resumo, subscrever...","reply_key_placeholder":"chave de resposta","skipped_reason_placeholder":"motivo"}}},"logs":{"title":"Logs","action":"Ação","created_at":"Criado","last_match_at":"Última Correspondência","match_count":"Correspondência","ip_address":"IP","topic_id":"ID do Tópico","post_id":"ID da Mensagem","category_id":"ID da Categoria","delete":"Eliminar","edit":"Editar","save":"Guardar","screened_actions":{"block":"bloquear","do_nothing":"não fazer nada"},"staff_actions":{"title":"Ações do Pessoal","instructions":"Clique nos nomes de utilizadores e nas ações para filtrar a lista. Clique nas fotografias de perfil para ir para as páginas dos utilizadores.","clear_filters":"Mostrar Tudo","staff_user":"Utilizador do Pessoal","target_user":"Utilizador Destino","subject":"Assunto","when":"Quando","context":"Contexto","details":"Detalhes","previous_value":"Anterior","new_value":"Novo","diff":"Diferenças","show":"Exibir","modal_title":"Detalhes","no_previous":"Não há valor anterior.","deleted":"Não há nenhum valor novo. O registo foi removido.","actions":{"delete_user":"remover utilizador","change_trust_level":"modificar Nível de Confiança","change_username":"alterar nome de utilizador","change_site_setting":"alterar configurações do sítio","change_site_customization":"alterar personalização do sítio","delete_site_customization":"remover personalização do sítio","suspend_user":"utilizador suspenso","unsuspend_user":"utilizador não suspenso","grant_badge":"conceder distintivo","revoke_badge":"revogar distintivo","check_email":"verificar email","delete_topic":"eliminar tópico","delete_post":"eliminar mensagem","impersonate":"personificar","anonymize_user":"tornar utilizador anónimo","roll_up":"agregar blocos IP","change_category_settings":"alterar configurações de categoria","delete_category":"eliminar categoria","create_category":"criar categoria"}},"screened_emails":{"title":"Emails Filtrados","description":"Quando alguém tenta criar uma nova conta, os seguintes endereços de email serão verificados e o registo será bloqueado, ou outra ação será executada.","email":"Endereço de Email","actions":{"allow":"Permitir"}},"screened_urls":{"title":"URLs Filtrados","description":"Os URLs listados aqui foram usados em mensagens de utilizadores que foram identificados como spammers.","url":"URL","domain":"Domínio"},"screened_ips":{"title":"IPs Filtrados","description":"Endereços IP que estão sob observação. Utilize \"Permitir\" para aprovar os endereços IP.","delete_confirm":"Tem a certeza que quer remover esta regra para %{ip_address}?","roll_up_confirm":"Tem a certeza que quer trazer os endereços IP frequentemente vistoriados para as sub-redes?","rolled_up_some_subnets":"Interdições das sub-redes %{subnets} inseridas com sucesso.","rolled_up_no_subnet":"Não há nada para atualizar.","actions":{"block":"Bloquear","do_nothing":"Permitir","allow_admin":"Permitir Administração"},"form":{"label":"Novo:","ip_address":"Endereço IP","add":"Adicionar","filter":"Pesquisar"},"roll_up":{"text":"Adicionar","title":"Cria interdições de sub-redes se existir pelo menos 'min_ban_entries_for_roll_up' entradas."}},"logster":{"title":"Registo de Erros em Logs"}},"impersonate":{"title":"Personificar","help":"Utilize este ferramenta de forma a personificar uma conta de utilizador para fins de depuração. Terá de encerrar a sessão assim que terminar.","not_found":"Esse utilizador não foi encontrado.","invalid":"Pedimos desculpa, não pode personificar esse utilizador."},"users":{"title":"Utilizadores","create":"Adicionar Utilizador da Admnistração","last_emailed":"Último email enviado","not_found":"Pedimos desculpa, esse nome de utilizador não existe no nosso sistema.","id_not_found":"Pedimos desculpa, esse id de utilizador não existe no nosso sistema.","active":"Ativo","show_emails":"Mostrar Emails","nav":{"new":"Novo","active":"Ativo","pending":"Pendente","staff":"Pessoal","suspended":"Suspenso","blocked":"Bloqueado","suspect":"Suspeito"},"approved":"Aprovado?","approved_selected":{"one":"aprovar utilizador","other":"aprovar utilizadores ({{count}})"},"reject_selected":{"one":"rejeitar utilizador","other":"rejeitar utilizadores ({{count}})"},"titles":{"active":"Utilizadores Ativos","new":"Utilizadores Novos","pending":"Utilizadores com Confirmação Pendente","newuser":"Utilizadores no Nível de Confiança 0 (Novo Utilizador)","basic":"Utilizadores no Nível de Confiança 1 (Utilizador Básico)","member":"Utilizadores no Nível de Confiança 2 (Membro)","regular":"Utilizadores no Nível de Confiança 3 (Habitual)","leader":"Utilizadores no Nível de Confiança 4 (Líder)","staff":"Pessoal","admins":"Utilizadores da Administração","moderators":"Moderadores","blocked":"Utilizadores Bloqueados","suspended":"Utilizadores Suspensos","suspect":"Utilizadores Suspeitos"},"reject_successful":{"one":"1 utilizador foi rejeitado com sucesso.","other":"%{count} utilizadores foram rejeitados com sucesso."},"reject_failures":{"one":"Falha ao rejeitar 1 utilizador.","other":"Falha ao rejeitar %{count} utilizadores."},"not_verified":"Não verificado","check_email":{"title":"Revelar o endereço de email deste utilizador","text":"Mostrar"}},"user":{"suspend_failed":"Ocorreu um erro ao suspender este utilizador {{error}}","unsuspend_failed":"Ocorreu um erro ao retirar a suspensão deste utilizador {{error}}","suspend_duration":"Durante quanto tempo o utilizador estará suspenso?","suspend_duration_units":"(dias)","suspend_reason_label":"Qual é o motivo da sua suspensão? Este texto \u003cb\u003eestará visível para todos\u003c/b\u003e na página do perfil deste utilizador, e será mostrada ao utilizador quando tentar iniciar sessão. Mantenha-o breve.","suspend_reason":"Motivo","suspended_by":"Suspendido por","delete_all_posts":"Eliminar todas as mensagens","delete_all_posts_confirm":"Está prestes a eliminar %{posts} mensagens e %{topics} tópicos. Tem a certeza de que quer continuar?","suspend":"Suspender","unsuspend":"Retirar a suspensão","suspended":"Suspendido?","moderator":"Moderador?","admin":"Administração?","blocked":"Bloqueado?","show_admin_profile":"Administração","edit_title":"Editar Título","save_title":"Guardar Título","refresh_browsers":"Forçar atualização da página no browser","refresh_browsers_message":"Mensagem enviada para todos os clientes!","show_public_profile":"Mostrar Perfil Público","impersonate":"Personificar","ip_lookup":"Pesquisa de IP","log_out":"Terminar Sessão","logged_out":"Sessão do utilizador encerrada em todos os dispositivos","revoke_admin":"Revogar Administração","grant_admin":"Conceder Administração","revoke_moderation":"Revogar Moderação","grant_moderation":"Conceder Moderação","unblock":"Desbloquear","block":"Bloquear","reputation":"Reputação","permissions":"Permissões","activity":"Atividade","like_count":"Gostos Dados / Recebidos","last_100_days":"nos últimos 100 dias","private_topics_count":"Tópicos Privados","posts_read_count":"Mensagens lidas","post_count":"Mensagens criadas","topics_entered":"Tópicos Visualizados","flags_given_count":"Sinalizações Dadas","flags_received_count":"Sinalizações Recebidas","warnings_received_count":"Avisos Recebidos","flags_given_received_count":"Sinalizações Dadas / Recebidas","approve":"Aprovar","approved_by":"aprovado por","approve_success":"Utilizador aprovado e email enviado com instruções de ativação.","approve_bulk_success":"Sucesso! Todos os utilizadores selecionados foram aprovados e notificados.","time_read":"Tempo de leitura","anonymize":"Tornar utilizador anónimo","anonymize_confirm":"Tem a CERTEZA que deseja tornar esta conta anónima? Isto irá alterar o nome de utilizador e email e repor todas as informações de perfil.","anonymize_yes":"Sim, tornar esta conta anónima","anonymize_failed":"Ocorreu um problema ao tornar esta conta anónima.","delete":"Eliminar Utilizador","delete_forbidden_because_staff":"Administradores e moderadores não podem ser eliminados.","delete_posts_forbidden_because_staff":"Não é possível eliminar todas as mensagens dos administradores e moderadores.","delete_forbidden":{"one":"Utilizadores não podem ser eliminados se tiverem mensagens. Apague todas as mensagens antes de eliminar o utilizador. (Mensagens com mais de %{count} dia de existência não podem ser eliminadas.)","other":"Utilizadores não podem ser eliminados se tiverem mensagens. Apague todas as mensagens antes de eliminar o utilizador. (Mensagens com mais de %{count} dias de existência não podem ser eliminadas.)"},"cant_delete_all_posts":{"one":"Não é possível eliminar todas as mensagens. Algumas mensagens existem há mais de %{count} dia. (A configuração delete_user_max_post_age.)","other":"Não é possível eliminar todas as mensagens. Algumas mensagens existem há mais de %{count} dias. (A configuração delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Não é possível eliminar todas as mensagens porque o utilizador tem mais de 1 mensagens. (delete_all_posts_max)","other":"Não é possível eliminar todas as mensagens porque o utilizador tem mais de %{count} mensagens. (delete_all_posts_max)"},"delete_confirm":"Tem a CERTEZA que deseja eliminar este utilizador? Esta ação é permanente!","delete_and_block":"Eliminar e \u003cb\u003ebloquear\u003cb\u003e este endereço de email e IP","delete_dont_block":"Apenas eliminar","deleted":"O utilizador foi eliminado.","delete_failed":"Ocorreu um erro ao eliminar o utilizador. Certifique-se de que todas as suas mensagens foram apagadas antes de tentar eliminá-lo.","send_activation_email":"Enviar Email de Ativação","activation_email_sent":"Um email de ativação foi enviado.","send_activation_email_failed":"Ocorreu um problema ao enviar um novo email de ativação. %{error}","activate":"Ativar Conta","activate_failed":"Ocorreu um problema ao ativar o utilizador.","deactivate_account":"Desativar Conta","deactivate_failed":"Ocorreu um problema ao desativar o utilizador.","unblock_failed":"Ocorreu um problema ao desbloquear o utilizador.","block_failed":"Ocorreu um problema ao bloquear o utilizador.","deactivate_explanation":"Um utilizador desativado deve revalidar o seu email.","suspended_explanation":"Um utilizador suspenso não pode iniciar sessão.","block_explanation":"Um utilizador bloqueado não pode publicar mensagens ou iniciar tópicos.","trust_level_change_failed":"Ocorreu um problema ao alterar o Nível de Confiança do utilizador.","suspend_modal_title":"Utilizador Suspenso","trust_level_2_users":"Utilizadores no Nível de Confiança 2","trust_level_3_requirements":"Requisitos do Nível de Confiança 3","trust_level_locked_tip":"o Nível de Confiança está bloqueado, o sistema não irá promover ou despromover o utilizador","trust_level_unlocked_tip":"o Nível de Confiança está desbloqueado, o sistema poderá promover ou despromover o utilizador","lock_trust_level":"Bloquear Nível de Confiança","unlock_trust_level":"Desbloquear Nível de Confiança","tl3_requirements":{"title":"Requisitos para o Nível de Confiança 3","table_title":"Nos últimos 100 dias:","value_heading":"Valor","requirement_heading":"Requisito","visits":"Visitas","days":"dias","topics_replied_to":"Tópicos com Respostas","topics_viewed":"Tópicos Visualizados","topics_viewed_all_time":"Tópicos Visualizados (desde sempre)","posts_read":"Mensagens lidas","posts_read_all_time":"Mensagens lidas (desde sempre)","flagged_posts":"Mensagens Sinalizadas","flagged_by_users":"Utilizadores Que Sinalizaram","likes_given":"Gostos Dados","likes_received":"Gostos Recebidos","likes_received_days":"Gostos recebidos: dias únicos","likes_received_users":"Gostos recebidos: utilizadores únicos","qualifies":"Qualifica-se para Nível de Confiança 3.","does_not_qualify":"Não se qualifica para o nível de confiança 3.","will_be_promoted":"Será promovido brevemente.","will_be_demoted":"Será despromovido brevemente.","on_grace_period":"Atualmente no período de carência da promoção, não será despromovido.","locked_will_not_be_promoted":"Nível de Confiança bloqueado. Nunca será promovido.","locked_will_not_be_demoted":"Nível de Confiança bloqueado. Nunca será despromovido."},"sso":{"title":"Inscrição Única","external_id":"ID Externo","external_username":"Nome de Utilizador","external_name":"Nome","external_email":"Email","external_avatar_url":"URL da Fotografia de Perfil"}},"user_fields":{"title":"Campos de utilizador","help":"Adicione campos que os seus utilizadores poderão preencher.","create":"Criar Campo de Utilizador","untitled":"Sem título","name":"Nome do Campo","type":"Tipo do Campo","description":"Descrição do Campo","save":"Guardar","edit":"Editar","delete":"Eliminar","cancel":"Cancelar","delete_confirm":"Tem a certeza que quer eliminar esse campo de utilizador?","options":"Opções","required":{"title":"Obrigatório na inscrição?","enabled":"obrigatório","disabled":"não obrigatório"},"editable":{"title":"Editável depois da inscrição?","enabled":"editável","disabled":"não editável"},"show_on_profile":{"title":"Exibir no perfil público?","enabled":"exibido no perfil","disabled":"não exibido no perfil"},"field_types":{"text":"Campo de Texto","confirm":"Confirmação","dropdown":"Suspenso"}},"site_text":{"none":"Escolha um tipo de conteúdo para começar a editar.","title":"Conteúdo do Texto"},"site_settings":{"show_overriden":"Apenas mostrar valores alterados","title":"Configurações","reset":"repor","none":"nenhum","no_results":"Não foi encontrado nenhum resultado.","clear_filter":"Limpar","add_url":"adicionar URL","add_host":"adicionar host","categories":{"all_results":"Todos","required":"Necessário","basic":"Configuração Básica","users":"Utilizadores","posting":"A publicar","email":"Email","files":"Ficheiros","trust":"Níveis de Confiança","security":"Segurança","onebox":"Caixa Única","seo":"SEO","spam":"Spam","rate_limits":"Limites de Classificação","developer":"Programador","embedding":"Incorporação","legal":"Legal","uncategorized":"Outro","backups":"Fazer Cópias de Segurança","login":"Iniciar Sessão","plugins":"Plugins","user_preferences":"Preferências do Utilizador"}},"badges":{"title":"Distintivos","new_badge":"Novo Distintivo","new":"Novo","name":"Nome","badge":"Distintivo","display_name":"Exibir Nome","description":"Descrição","badge_type":"Tipo de Distintivo","badge_grouping":"Grupo","badge_groupings":{"modal_title":"Agrupamento de Distintivos"},"granted_by":"Concedido Por","granted_at":"Concedido Em","reason_help":"(Uma hiperligação para uma mensagem ou tópico)","save":"Guardar","delete":"Apagar","delete_confirm":"Tem a certeza que quer eliminar este distintivo?","revoke":"Revogar","reason":"Motivo","expand":"Expandir \u0026hellip;","revoke_confirm":"Tem a certeza que quer revogar este distintivo?","edit_badges":"Editar Distintivos","grant_badge":"Conceder Distintivo","granted_badges":"Distintivos Concedidos","grant":"Conceder","no_user_badges":"%{name} não recebeu qualquer distintivo.","no_badges":"Não existe qualquer distintivo que possa ser concedido.","none_selected":"Selecione um distintivo para iniciar","allow_title":"Permitir o uso de distintivos como título","multiple_grant":"Pode ser concedido múltiplas vezes","listable":"Mostrar distintivo na página pública de distintivos","enabled":"Ativar distintivos","icon":"Ícone","image":"Imagem","icon_help":"Use uma classe Font Awesome ou um URL para uma imagem","query":"\"Query\" de Distintivo (SQL)","target_posts":"\"Query\" direcionada a mensagens","auto_revoke":"Executar diariamente a \"query\" de revogação ","show_posts":"Mostrar mensagens de concessão de distintivo na página de distintivos","trigger":"Acionar","trigger_type":{"none":"Atualizado diariamente","post_action":"Quando um utilizador atua numa mensagem","post_revision":"Quando um utilizador edita ou cria uma mensagem","trust_level_change":"Quando um utilizador muda de Nível de Confiança","user_change":"Quando um utilizador é editado ou criado"},"preview":{"link_text":"Pré-visualizar distintivos concedidos","plan_text":"Pré-visualizar com plano de consulta","modal_title":"Pré-visualização da \"Query\" de Distintivo","sql_error_header":"Ocorreu um erro com a consulta.","error_help":"Veja as seguintes hiperligações para obter ajuda com \"queries\" de distintivos","bad_count_warning":{"header":"AVISO!","text":"Estão em falta amostras de concessão. Isto acontece quando a \"query\" do sistema de distintivos devolve IDs de nomes de utilizador ou IDs de mensagens que não existem. Isto pode causar resultados inesperados futuramente, sendo que deverá rever a sua \"query\"."},"no_grant_count":"Nenhuns distintivos a atribuir.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e distintivo a atribuir.","other":"\u003cb\u003e%{count}\u003c/b\u003e distintivos a atribuir."},"sample":"Amostra:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pela mensagem em %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e pela mensagem em %{link} às \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e às \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Adicionar novo emoji que irá estar disponível para todos. (PROTIP: arraste múltiplos ficheiros de uma só vez)","add":"Adicionar Novo Emoji","name":"Nome","image":"Imagem","delete_confirm":"Tem a certeza que deseja eliminar o emoji :%{name}:?"},"embedding":{"get_started":"Se deseja incorporar o Discourse noutro sítio, comece por adicionar o seu servidor.","confirm_delete":"Tem certeza que deseja eliminar este servidor?","sample":"Utilize o seguinte código HTML no seu sítio para criar e incorporar tópicos do discourse. Substitua \u003cb\u003eREPLACE_ME\u003c/b\u003e pelo URL canónico da página onde está a incorporá-los.","title":"Incorporação","host":"Servidores Permitidos","edit":"editar","category":"Mensagem para Categoria","add_host":"Adicionar Servidor","settings":"Configurações de Incorporação","feed_settings":"Configurações do Feed","feed_description":"Fornecer um fed RSS/ATOM para o seu sítio pode melhorar a habilidade do Discourse de importar o seu conteúdo.","crawling_settings":"Configurações de Rastreio","crawling_description":"Quando o Discourse cria tópicos para as suas mensagens, se nenhum feed RSS/ATOM está presente o Discourse irá tentar analisar o seu conteúdo fora do seu HTML. Algumas vezes pode ser um desafio extrair o seu conteúdo, por isso temos a habilidade de especificar regras CSS para tornar a extração mais fácil. ","embed_by_username":"Nome de uilizador para criação do tópico","embed_post_limit":"Número máximo de mensagens a incorporar","embed_username_key_from_feed":"Chave para puxar o nome de utilizador discouse do feed","embed_truncate":"Truncar as mensagens incorporadas","embed_whitelist_selector":"Seletor CSS para elementos que são permitidos nas incorporações","embed_blacklist_selector":"Seletor CSS para elementos que são removidos das incorporações","feed_polling_enabled":"Importar mensagens através de RSS/ATOM","feed_polling_url":"URL do feed RSS/ATOM para rastreio","save":"Guardar Configurações de Incorporação"},"permalink":{"title":"Hiperligações Permanentes","url":"URL","topic_id":"ID do Tópico","topic_title":"Tópico","post_id":"ID da Mensagem","post_title":"Mensagem","category_id":"ID da Categoria","category_title":"Categoria","external_url":"URL Externo","delete_confirm":"Tem a certeza que deseja eliminar esta hiperligação permanente?","form":{"label":"Novo:","add":"Adicionar","filter":"Pesquisar (URL ou URL Externo)"}}},"lightbox":{"download":"descarregar"},"search_help":{"title":"Pesquisar Ajuda"},"keyboard_shortcuts_help":{"title":"Atalhos de Teclado","jump_to":{"title":"Ir Para","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Página Principal","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Recentes","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Novo","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Não lido","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Categorias","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Os Melhores","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Marcadores","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Perfil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mensagens"},"navigation":{"title":"Navegação","jump":"\u003cb\u003e#\u003c/b\u003e Ir para o post #","back":"\u003cb\u003eu\u003c/b\u003e Retroceder","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Mover seleção \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e ou \u003cb\u003eEnter\u003c/b\u003e Abrir tópico selecionado","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Secção Seguinte/Anterior"},"application":{"title":"Aplicação","create":"\u003cb\u003ec\u003c/b\u003e Criar um novo tópico","notifications":"\u003cb\u003en\u003c/b\u003e Abrir notificações","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Abrir menu hamburger","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Abrir menu do utilizador","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Mostrar tópicos atualizados","search":"\u003cb\u003e/\u003c/b\u003e Pesquisar","help":"\u003cb\u003e?\u003c/b\u003e Abrir ajuda do teclado","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Destituir Novos/Mensagens","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Destituir Tópicos","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Terminar Sessão"},"actions":{"title":"Ações","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Alternar marcador de tópico","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Tópico Fixado/Desafixado","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Partilhar tópico","share_post":"\u003cb\u003es\u003c/b\u003e Partilhar mensagem","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Responder como tópico hiperligado","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Responder ao tópico","reply_post":"\u003cb\u003er\u003c/b\u003e Responder à mensagem","quote_post":"\u003cb\u003eq\u003c/b\u003e Citar mensagem","like":"\u003cb\u003el\u003c/b\u003e Gostar da mensagem","flag":"\u003cb\u003e!\u003c/b\u003e Sinalizar mensagem","bookmark":"\u003cb\u003eb\u003c/b\u003e Adicionar mensagem aos marcadores","edit":"\u003cb\u003ee\u003c/b\u003e Editar mensagem","delete":"\u003cb\u003ed\u003c/b\u003e Eliminar mensagem","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Silenciar tópico","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Tópico Habitual (por defeito)","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Acompanhar tópico","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Vigiar este tópico"}},"badges":{"title":"Distintivos","allow_title":"pode ser usado como título","multiple_grant":"pode ser premiado múltiplas vezes","badge_count":{"one":"1 Distintivo","other":"%{count} Distintivos"},"more_badges":{"one":"+1 Mais","other":"+%{count} Mais"},"granted":{"one":"1 concedida","other":"%{count} concedidas"},"select_badge_for_title":"Selecionar um distintivo para usar como título","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Dar Início"},"community":{"name":"Comunidade"},"trust_level":{"name":"Nível de Confiança"},"other":{"name":"Outro"},"posting":{"name":"A publicar"}},"badge":{"editor":{"name":"Editor","description":"Primeira edição de uma mensagem"},"basic_user":{"name":"Básico","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eAtribuídas\u003c/a\u003e todas as funções comunitárias essenciais"},"member":{"name":"Membro","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003eAtribuídos\u003c/a\u003e convites"},"regular":{"name":"Habitual","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eAtribuída\u003c/a\u003e re-categorização, renomeação, seguimento de hiperligações e lounge"},"leader":{"name":"Líder","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003eAtribuída a\u003c/a\u003e edição, destaque, encerramento, arquivo, separação e junção globais"},"welcome":{"name":"Bem-vindo","description":"Recebeu um gosto"},"autobiographer":{"name":"Autobiógrafo","description":"Preencheu informações no \u003ca href=\"/my/preferences\"\u003eperfil\u003c/a\u003e de utilizador "},"anniversary":{"name":"Aniversário","description":"Membro ativo há um ano, publicou pelo menos uma vez"},"nice_post":{"name":"Boa Mensagem","description":"Recebeu 10 gostos numa mensagem. Este distintivo pode ser concedido diversas vezes"},"good_post":{"name":"Ótima Mensagem","description":"Recebeu 25 gostos numa mensagem. Este distintivo pode ser concedido diversas vezes "},"great_post":{"name":"Excelente Mensagem","description":"Recebeu 50 gostos numa mensagem. Este distintivo pode ser concedido diversas vezes"},"nice_topic":{"name":"Bom Tópico","description":"Recebeu 10 gostos num tópico. Este distintivo pode ser concedido diversas vezes"},"good_topic":{"name":"Ótimo Tópico","description":"Recebeu 25 gostos num tópico. Este distintivo pode ser concedido diversas vezes "},"great_topic":{"name":"Excelente Tópico","description":"Recebeu 50 gostos num tópico. Este distintivo pode ser concedido diversas vezes"},"nice_share":{"name":"Boa Partilha","description":"Partilhou uma mensagem com 25 visitantes únicos"},"good_share":{"name":"Ótima Partilha","description":"Partilhou uma mensagem com 300 visitantes únicos"},"great_share":{"name":"Excelente Partilha","description":"Partilhou uma mensagem com 1000 visitantes únicos"},"first_like":{"name":"Primeiro Gosto","description":"Gostou de uma mensagem"},"first_flag":{"name":"Primeira Sinalização","description":"Sinalizou uma mensagem"},"promoter":{"name":"Promotor","description":"Convidou um utilizador"},"campaigner":{"name":"Partidário","description":"Convidou 3 utilizadores básicos (nível de confiança 1)"},"champion":{"name":"Campeão","description":"Convidou 5 membros (nível de confiança 2)"},"first_share":{"name":"Primeira Partilha","description":"Partilhou uma mensagem"},"first_link":{"name":"Primeira Hiperligação","description":"Adicionou uma hiperligação interna para outro tópico"},"first_quote":{"name":"Primeira Citação","description":"Citou um utilizador"},"read_guidelines":{"name":"Ler Diretrizes","description":"Leu as \u003ca href=\"/guidelines\"\u003ediretrizes da comunidade\u003c/a\u003e"},"reader":{"name":"Leitor","description":"Ler todas as mensagens num tópico com mais de 100 mensagens"},"popular_link":{"name":"Hiperligação Popular","description":"Foi publicada uma hiperligação externa com pelo menos 50 cliques"},"hot_link":{"name":"Hiperligação Quente","description":"Foi publicada uma hiperligação externa com pelo menos 300 cliques"},"famous_link":{"name":"Hiperligação Famosa","description":"Foi publicada uma hiperligação externa com pelo menos 1000 cliques"}}},"google_search":"\u003ch3\u003ePesquise com o Google\u003c/h3\u003e\n\u003cp\u003e\n\u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n\u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n\u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n\u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n\u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."}},"user":{"messages":{"groups":"My Groups"}},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"topic":{"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","controls":"Topic Controls"},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"}}}}};
I18n.locale = 'pt';
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
// locale : portuguese (pt)
// author : Jefferson : https://github.com/jalex79

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    return moment.defineLocale('pt', {
        months : "janeiro_fevereiro_março_abril_maio_junho_julho_agosto_setembro_outubro_novembro_dezembro".split("_"),
        monthsShort : "jan_fev_mar_abr_mai_jun_jul_ago_set_out_nov_dez".split("_"),
        weekdays : "domingo_segunda-feira_terça-feira_quarta-feira_quinta-feira_sexta-feira_sábado".split("_"),
        weekdaysShort : "dom_seg_ter_qua_qui_sex_sáb".split("_"),
        weekdaysMin : "dom_2ª_3ª_4ª_5ª_6ª_sáb".split("_"),
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
            past : "há %s",
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
        ordinal : '%dº',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('DD MMM'); };
moment.fn.shortDate = function(){ return this.format('DD MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('DD de MMMM de YYYY hh:mm'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};
