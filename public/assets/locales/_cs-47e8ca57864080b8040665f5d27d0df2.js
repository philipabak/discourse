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
MessageFormat.locale.cs = function (n) {
  if (n == 1) {
    return 'one';
  }
  if (n == 2 || n == 3 || n == 4) {
    return 'few';
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
    })({"posts_likes_MF" : function(d){
var r = "";
r += "Toto téma má ";
if(!d){
throw new Error("MessageFormat: No data passed to function.");
}
var lastkey_1 = "count";
var k_1=d[lastkey_1];
var off_0 = 0;
var pf_0 = { 
"one" : function(d){
var r = "";
r += "1 příspěvek";
return r;
},
"other" : function(d){
var r = "";
r += "" + (function(){ var x = k_1 - off_0;
if( isNaN(x) ){
throw new Error("MessageFormat: `"+lastkey_1+"` isnt a number.");
}
return x;
})() + " příspěvků";
return r;
}
};
if ( pf_0[ k_1 + "" ] ) {
r += pf_0[ k_1 + "" ]( d ); 
}
else {
r += (pf_0[ MessageFormat.locale["cs"]( k_1 - off_0 ) ] || pf_0[ "other" ] )( d );
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
r += "s velkým poměrem líbí se na příspěvek";
return r;
},
"med" : function(d){
var r = "";
r += "s velmi velkým poměrem líbí se na příspěvek";
return r;
},
"high" : function(d){
var r = "";
r += "s extrémně velkým poměrem líbí se na příspěvek";
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
}});I18n.translations = {"cs":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"one":"bajt","few":"bajty","other":"bajtů"},"gb":"GB","kb":"kB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}k","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"MMM D h:mm a","long_no_year_no_time":"MMM D","full_no_year_no_time":"MMMM Do","long_with_year":"MMM D, YYYY h:mm a","long_with_year_no_time":"MMM D, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"MMM D, 'YY LT","long_date_without_year":"MMM D, LT","long_date_with_year_without_time":"MMM D, 'YY","long_date_without_year_with_linebreak":"MMM D \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"MMM D, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1m","less_than_x_seconds":{"one":"\u003c 1s","few":"\u003c %{count}s","other":"\u003c %{count}s"},"x_seconds":{"one":"1s","few":"%{count}s","other":"%{count}s"},"less_than_x_minutes":{"one":"\u003c 1m","few":"\u003c %{count}m","other":"\u003c %{count}m"},"x_minutes":{"one":"1m","few":"%{count}m","other":"%{count}m"},"about_x_hours":{"one":"1h","few":"%{count}h","other":"%{count}h"},"x_days":{"one":"1d","few":"%{count}d","other":"%{count}d"},"about_x_years":{"one":"1r","few":"%{count}r","other":"%{count}let"},"over_x_years":{"one":"\u003e 1r","few":"\u003e %{count}r","other":"\u003e %{count}let"},"almost_x_years":{"one":"1r","few":"%{count}r","other":"%{count}let"},"date_month":"MMM D","date_year":"MMM 'YY"},"medium":{"x_minutes":{"one":"1 minuta","few":"%{count} minuty","other":"%{count} minut"},"x_hours":{"one":"1 hodina","few":"%{count} hodiny","other":"%{count} hodin"},"x_days":{"one":"1 den","few":"%{count} dny","other":"%{count} dní"},"date_year":"MMM D, 'YY"},"medium_with_ago":{"x_minutes":{"one":"před 1 minutou","few":"před %{count} minutami","other":"před %{count} minutami"},"x_hours":{"one":"před 1 hodinou","few":"před %{count} hodinami","other":"před %{count} hodinami"},"x_days":{"one":"před 1 dnem","few":"před %{count} dny","other":"před %{count} dny"}},"later":{"x_days":{"one":"za 1 den","few":"za %{count} dny","other":"za %{count} dní"},"x_months":{"one":"za 1 měsíc","few":"za %{count} měsíce","other":"za %{count} měsíců"},"x_years":{"one":"za 1 rok","few":"za %{count} roků","other":"za %{count} let"}}},"share":{"topic":"sdílet odkaz na toto téma","post":"příspěvek #%{postNumber}","close":"zavřít","twitter":"sdílet odkaz na Twitteru","facebook":"sdílet odkaz na Facebooku","google+":"sdílet odkaz na Google+","email":"odeslat odkaz emailem"},"topic_admin_menu":"akce administrátora tématu","emails_are_disabled":"Všechny odchozí emaily byly administrátorem vypnuty. Žádné odchozí emaily nebudou odeslány.","edit":"upravit název a kategorii příspěvku","not_implemented":"Tato funkce ještě nebyla naprogramována, omlouváme se.","no_value":"Ne","yes_value":"Ano","generic_error":"Bohužel nastala chyba.","generic_error_with_reason":"Nastala chyba: %{error}","sign_up":"Registrace","log_in":"Přihlásit se","age":"Věk","joined":"Účet vytvořen","admin_title":"Administrace","flags_title":"Nahlášení","show_more":"zobrazit více","links":"Odkazy","links_lowercase":{"one":"odkaz","few":"odkazy","other":"odkazů"},"faq":"FAQ","guidelines":"Pokyny","privacy_policy":"Ochrana soukromí","privacy":"Soukromí","terms_of_service":"Podmínky služby","mobile_view":"Mobilní verze","desktop_view":"Plná verze","you":"Vy","or":"nebo","now":"právě teď","read_more":"číst dále","more":"Více","less":"Méně","never":"nikdy","daily":"denně","weekly":"týdně","every_two_weeks":"jednou za 14 dní","every_three_days":"každé tři dny","max_of_count":"max z","alternation":"nebo","character_count":{"one":"{{count}} znak","few":"{{count}} znaky","other":"{{count}} znaků"},"suggested_topics":{"title":"Doporučená témata"},"about":{"simple_title":"O fóru","title":"O %{title}","stats":"Statistiky Webu","our_admins":"Naši Admini","our_moderators":"Naši Moderátoři","stat":{"all_time":"Za celou dobu","last_7_days":"Posledních 7 dní","last_30_days":"Posledních 30 dní"},"like_count":"Líbí se","topic_count":"Témata","post_count":"Příspěvky","user_count":"Noví uživatelé","active_user_count":"Aktivní uživatelé","contact":"Kontaktujte nás","contact_info":"V případě kritické chyby nebo urgentní záležitosti ovlivňující tuto stránku nás prosím kontaktujte na %{contact_info}."},"bookmarked":{"title":"Záložka","clear_bookmarks":"Odstranit záložky","help":{"bookmark":"Kliknutím vložíte záložku na první příspěvek tohoto tématu","unbookmark":"Kliknutím odstraníte všechny záložky v tématu"}},"bookmarks":{"not_logged_in":"Pro přidání záložky se musíte přihlásit.","created":"Záložka byla přidána.","not_bookmarked":"Tento příspěvek jste již četli. Klikněte pro přidání záložky.","last_read":"Toto je váš poslední přečtený příspěvek. Klikněte pro přidání záložky.","remove":"Odstranit záložku","confirm_clear":"Opravdu chcete odstranit všechny záložky z tohoto tématu?"},"topic_count_latest":{"one":"{{count}} nové nebo upravené téma.","few":"{{count}} nová nebo upravená témata.","other":"{{count}} nových nebo upravených témat."},"topic_count_unread":{"one":"{{count}} nepřečtené téma.","few":"{{count}} nepřečtená témata.","other":"{{count}} nepřečtených témat."},"topic_count_new":{"one":"{{count}} nové téma.","few":"{{count}} nová témata.","other":"{{count}} nových témat."},"click_to_show":"Klikněte pro zobrazení.","preview":"ukázka","cancel":"zrušit","save":"Uložit změny","saving":"Ukládám...","saved":"Uloženo!","upload":"Obrázek","uploading":"Nahrávám...","uploaded":"Nahráno!","enable":"Zapnout","disable":"Vypnout","undo":"Zpět","revert":"Vrátit","failed":"Selhání","switch_to_anon":"Anonymní mód","banner":{"close":"Odmítnout tento banner.","edit":"Editujte tento banner \u003e\u003e"},"choose_topic":{"none_found":"Žádná témata nenalezena.","title":{"search":"Hledat téma podle názvu, URL nebo ID:","placeholder":"sem napište název tématu"}},"queue":{"topic":"Téma:","approve":"Schválit","reject":"Odmítnout","delete_user":"Smažat uživatele","title":"Potřebuje schválení","none":"Žádné příspěvky ke kontrole.","edit":"Upravit","cancel":"Zrušit","view_pending":"zobrazit příspěvky čekající na schválení","has_pending_posts":{"one":"Toto téma má 1 příspěvek, který čeká na schválení.","few":"Toto téma má \u003cb\u003e{{count}}\u003c/b\u003e příspěvky, které čekají na schválení.","other":"Toto téma má \u003cb\u003e{{count}}\u003c/b\u003e příspěvků, které čekají na schválení."},"confirm":"Uložit změny","delete_prompt":"Jsi si jistý, že chceš smazat \u003cb\u003e%{username}\u003c/b\u003e? Smažou se všechny jeho příspěvky, zablokuje se jeho email a IP adresa,","approval":{"title":"Příspěvek potřebuje schválení","description":"Obdrželi jsme váš příspěvek, ale musí být před zveřejněním schválen moderátorem. Buďte trpěliví.","pending_posts":{"one":"Máte \u003cstrong\u003e1\u003c/strong\u003e příspěvek ke schválení.","few":"Máte \u003cstrong\u003e{{count}}\u003c/strong\u003e příspěvků ke schválení.","other":"Máte \u003cstrong\u003e{{count}}\u003c/strong\u003e příspěvků ke schválení."},"ok":"OK"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e zaslal \u003ca href='{{topicUrl}}'\u003etéma\u003c/a\u003e","you_posted_topic":"Zaslal jste \u003ca href='{{topicUrl}}'\u003etéma\u003c/a\u003e","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e odpověděl na příspěvek \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","you_replied_to_post":"Odpověděl jste na příspěvek \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e přispěl do \u003ca href='{{topicUrl}}'\u003etématu\u003c/a\u003e","you_replied_to_topic":"Přispěl jste do \u003ca href='{{topicUrl}}'\u003etématu\u003c/a\u003e","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e zmínil uživatele \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{user2Url}}'\u003evás\u003c/a\u003e zmínil","you_mentioned_user":"Zmínil jste uživatele \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e","posted_by_user":"Příspěvěk od \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","posted_by_you":"Odesláno \u003ca href='{{userUrl}}'\u003evámi\u003c/a\u003e","sent_by_user":"Posláno uživatelem \u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e","sent_by_you":"Posláno \u003ca href='{{userUrl}}'\u003evámi\u003c/a\u003e"},"directory":{"filter_name":"Filtrovat podle uživatelského jména","title":"Uživatelé","likes_given":"Rozdáno","likes_received":"Obdrženo","topics_entered":"Navštíveno","topics_entered_long":"Témat navštíveno","time_read":"Čas strávený čtením","topic_count":"Témata","topic_count_long":"Témat vytvořeno","post_count":"Odpovědi","post_count_long":"Odpovědí","no_results":"Žádné výsledky","days_visited":"Návštěv","days_visited_long":"Dní navštíveno","posts_read":"Přečteno","posts_read_long":"Příspěvků přečteno","total_rows":{"one":"1 uživatel","few":"%{count} uživatelé","other":"%{count} uživatelů"}},"groups":{"visible":"Skupina je viditelná pro všechny uživatele","title":{"one":"skupina","few":"skupiny","other":"skupiny"},"members":"Členové","posts":"Odpovědi","alias_levels":{"title":"Kdo může zmínit tuto skupinu jako @skupina?","nobody":"Nikdo","only_admins":"Pouze správci","mods_and_admins":"Pouze moderátoři a správci","members_mods_and_admins":"Pouze členové skupiny, moderátoři a správci","everyone":"Kdokoliv"}},"user_action_groups":{"1":"Rozdaných 'líbí se'","2":"Obdržených 'líbí se'","3":"Záložky","4":"Témata","5":"Odpovědi","6":"Odezva","7":"Zmínění","9":"Citace","10":"Oblíbené","11":"Editace","12":"Odeslané zprávy","13":"Přijaté zprávy","14":"Čeká na schválení"},"categories":{"all":"všechny kategorie","all_subcategories":"vše","no_subcategory":"žádné","category":"Kategorie","posts":"Příspěvky","topics":"Témata","latest":"Aktuální","latest_by":"latest by","toggle_ordering":"Přepnout editaci pořadí","subcategories":"Podkategorie","topic_stats":"Počet nových témat.","topic_stat_sentence":{"one":"%{count} nové téma za posledních %{unit}.","few":"%{count} nová témata za posledních %{unit}.","other":"%{count} nových témat za posledních %{unit}."},"post_stats":"Počet nových příspěvků.","post_stat_sentence":{"one":"%{count} nový příspěvěk za posledních %{unit}.","few":"%{count} nové příspěvky za posledních %{unit}.","other":"%{count} nových příspěvků za posledních %{unit}."}},"ip_lookup":{"title":"Vyhledávání podle IP adresy","hostname":"Hostname","location":"Lokace","location_not_found":"(neznámá)","organisation":"Organizace","phone":"Telefon","other_accounts":"Další účty s touto IP adresou:","delete_other_accounts":"Smazat","username":"uživatelské jméno","trust_level":"Důvěra","read_time":"čas k přečtení","topics_entered":"témat zadáno","post_count":"počet příspěvků","confirm_delete_other_accounts":"Určitě chcete smazat tyto účty?"},"user":{"said":"{{username}}:","profile":"Profil","mute":"Ignorovat","edit":"Upravit nastavení","download_archive":"Stáhnout moje příspěvky","new_private_message":"Nová zpráva","private_message":"Zpráva","private_messages":"Zprávy","activity_stream":"Aktivita","preferences":"Nastavení","bookmarks":"Záložky","bio":"O mně","invited_by":"Pozvánka od","trust_level":"Důvěryhodnost","notifications":"Oznámení","dismiss_notifications":"Označ vše jako přečtené","dismiss_notifications_tooltip":"Označit všechny nepřečtené notifikace jako přečtené","disable_jump_reply":"Po odpovědi nepřeskakovat na nový příspěvek","dynamic_favicon":"Zobrazit počet nových témat v ikoně prohlížeče","edit_history_public":"Povolit ostatním zobrazení všech verzí mého příspěvku","external_links_in_new_tab":"Otevírat všechny externí odkazy do nové záložky","enable_quoting":"Povolit odpověď s citací z označeného textu","change":"změnit","moderator":"{{user}} je moderátor","admin":"{{user}} je administrátor","moderator_tooltip":"Tento uživatel je moderátor","admin_tooltip":"Tento uživatel je admi","suspended_notice":"Uživatel je suspendován do {{date}}.","suspended_reason":"Důvod: ","github_profile":"Github","mailing_list_mode":"Upozornit emailem na každý nový příspěvek (kromě ztišených témat a kategorií).","watched_categories":"Hlídané","watched_categories_instructions":"Budete automaticky sledovat všechna nová témata v těchto kategoriích. Na všechny nové příspěvky a témata budete upozorněni. Počet nových příspěvků se zobrazí vedle tématu.","tracked_categories":"Sledované","tracked_categories_instructions":"Všechna nová témata v této kategorii budou automaticky hlídaná. Počet nových příspěvků se zobrazí vedle tématu.","muted_categories":"Ztišené","delete_account":"Smazat můj účet","delete_account_confirm":"Jste si jisti, že chcete trvale odstranit svůj účet? Tuto akci nelze vrátit zpět!","deleted_yourself":"Váš účet byl úspěšně odstraněn.","delete_yourself_not_allowed":"Váš účet teď nejde odstranit. Obraťte se na správce aby váš účet smazal za vás.","unread_message_count":"Zprávy","admin_delete":"Smazat","users":"Uživatelé","muted_users":"Ztišení","muted_users_instructions":"Umlčet všechny notifikace od těchto uživatelů.","staff_counters":{"flags_given":"užitečná nahlášení","flagged_posts":"nahlášených příspěvků","deleted_posts":"smazaných příspěvků","suspensions":"vyloučení","warnings_received":"varování"},"messages":{"all":"Všechny","mine":"Moje","unread":"Nepřečtené"},"change_password":{"success":"(email odeslán)","in_progress":"(odesílám)","error":"(chyba)","action":"Odeslat email na obnovu hesla","set_password":"Nastavit heslo"},"change_about":{"title":"Změna o mně","error":"Při změně této hodnoty nastala chyba."},"change_username":{"title":"Změnit uživatelské jméno","confirm":"Změna uživatelského jména může mít vážné následky. Opravdu to chcete udělat?","taken":"Toto uživatelské jméno je již zabrané.","error":"Nastala chyba při změně uživatelského jména.","invalid":"Uživatelské jméno je neplatné. Musí obsahovat pouze písmena a číslice."},"change_email":{"title":"Změnit emailovou adresu","taken":"Tato emailová adresa není k dispozici.","error":"Nastala chyba při změně emailové adresy. Není tato adresa již používaná?","success":"Na zadanou adresu jsme zaslali email. Následujte, prosím, instrukce v tomto emailu."},"change_avatar":{"title":"Změňte si svůj profilový obrázek","gravatar":"Založeno na \u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003eu","gravatar_title":"Změňte si avatar na webových stránkách Gravatar","refresh_gravatar_title":"Obnovit Gravatar","letter_based":"Systémem přidělený profilový obrázek","uploaded_avatar":"Vlastní obrázek","uploaded_avatar_empty":"Přidat vlastní obrázek","upload_title":"Nahrát obrázek","upload_picture":"Nahrát obrázek","image_is_not_a_square":"Varování: Ořízli jsme váš avatar; šířka a délka nebyla stejná."},"change_profile_background":{"title":"Pozadí profilu","instructions":"Pozadí profilu je zarovnáno doprostřed a má výchozí šířku 850px."},"change_card_background":{"title":"Pozadí uživatelské karty","instructions":"Obrázky pozadí jsou zarovnány a mají výchozí šířku 590px. "},"email":{"title":"Emailová adresa","instructions":"Nebude zveřejněno","ok":"Pro potvrzení vám pošleme email.","invalid":"Zadejte prosím správnou emailovou adresu","authenticated":"Vaše emailová adresa byla autorizována přes službu {{provider}}."},"name":{"title":"Jméno","instructions":"Celé jméno (volitelně)","instructions_required":"Vaše celé jméno","too_short":"Máte moc krátké jméno","ok":"Parádní jméno"},"username":{"title":"Uživatelské jméno","instructions":"Unikátní, bez mezer, radši kratší","short_instructions":"Lidé vás mohou zmínit pomocí @{{username}}","available":"Vaše uživatelské jméno je volné","global_match":"Email odpovídá registrovanému uživatelskému jménu.","global_mismatch":"již zaregistrováno. Co třeba {{suggestion}}?","not_available":"Není k dispozici. Co třeba {{suggestion}}?","too_short":"Uživatelské jméno je moc krátké","too_long":"Uživatelské jméno je moc dlouhé","checking":"Zjišťuji, zda je uživatelské jméno volné...","enter_email":"Uživatelské jméno nalezeno; vyplňte propojený email","prefilled":"Email je propojen s tímto uživatelským jménem"},"locale":{"title":"Jazyk rozhraní","instructions":"Jazyk uživatelského prostředí. Změna obnoví stránku.","default":"(výchozí)"},"password_confirmation":{"title":"Heslo znovu"},"last_posted":"Poslední příspěvek","last_emailed":"Email naposledy zaslán","last_seen":"Naposledy viděn","created":"Účet vytvořen","log_out":"Odhlásit se","location":"Lokace","card_badge":{"title":"User Card Badge"},"website":"Webová stránka","email_settings":"Emailová upozornění","email_digests":{"title":"Když tady dlouho nebudu, chci emailem zaslat co je nového:","daily":"denně","every_three_days":"každé tři dny","weekly":"týdně","every_two_weeks":"každé dva týdny"},"email_direct":"Zašli mi email, pokud mě někde cituje, odpoví na můj příspěvek, zmíní mé @jméno nebo mě pozve do tématu.","email_private_messages":"Zašli mi email, pokud mi někdo pošle zprávu.","other_settings":"Ostatní","categories_settings":"Kategorie","new_topic_duration":{"label":"Považovat témata za nová, pokud","not_viewed":"jsem je dosud neviděl.","last_here":"byla vytvořena od mé poslední návštěvy."},"auto_track_topics":"Automaticky sledovat témata, která navštívím","auto_track_options":{"never":"nikdy","immediately":"ihned"},"invited":{"search":"pište pro hledání v pozvánkách...","title":"Pozvánky","user":"Pozvaný uživatel","redeemed":"Uplatněné pozvánky","redeemed_tab":"Uplatněno","redeemed_at":"Uplatněno","pending":"Nevyřízené pozvánky","pending_tab":"Čeká na schválení","topics_entered":"Zobrazil témat","posts_read_count":"Přečteno příspěvků","expired":"Poznávka je už prošlá.","rescind":"Smazat","rescinded":"Pozvánka odstraněna","reinvite":"Znovu poslat pozvánku","reinvited":"Pozvánka byla opětovně odeslána.","time_read":"Čas čtení","days_visited":"Přítomen dnů","account_age_days":"Stáří účtu ve dnech","create":"Poslat pozvánku","bulk_invite":{"none":"Zatím jste nikoho nepozval. Můžete poslat individuální pozvánku nebo pozvat skupinu lidí naráz pomocí \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003enahrání souboru\u003c/a\u003e.","text":"Hromadné pozvání s pomocí souboru","uploading":"Nahrávám...","success":"Nahrání souboru proběhlo úspěšně. O dokončení celého procesu budete informování pomocí zprávy.","error":"Nastala chyba při nahrávání '{{filename}}': {{message}}"}},"password":{"title":"Heslo","too_short":"Vaše heslo je příliš krátké.","common":"Toto heslo je používané moc často.","same_as_username":"Vaše heslo je stejné jako Vaše uživatelské jméno.","same_as_email":"Vaše heslo je stejné jako váš e-mail.","ok":"Vaše heslo je v pořádku.","instructions":"Alespo %{count} znaků."},"associated_accounts":"Přihlášení","ip_address":{"title":"Poslední IP adresa"},"registration_ip_address":{"title":"Registrační IP adresa"},"avatar":{"title":"Profilový obrázek","header_title":"profil, zprávy, záložky a nastavení"},"title":{"title":"Titul"},"filters":{"all":"Všechno"},"stream":{"posted_by":"Zaslal","sent_by":"Odeslal","private_message":"zpráva","the_topic":"téma"}},"loading":"Načítám...","errors":{"prev_page":"při nahrávání stránky","reasons":{"network":"Chyba sítě","server":"Chyba serveru","forbidden":"Přístup zamítnut","unknown":"Chyba"},"desc":{"network":"Prosím zkontrolujte své připojení.","network_fixed":"Looks like it's back.","server":"Kód chyby: {{status}}","forbidden":"Nemáte povolení to spatřit.","unknown":"Něco se pokazilo."},"buttons":{"back":"Zpět","again":"Zkusit znovu","fixed":"Nahrávám"}},"close":"Zavřít","assets_changed_confirm":"Tento web se právě aktualizoval. Chcete obnovit stránku a mít nejnovější verzi?","logout":"Byli jste odhlášeni.","refresh":"Obnovit","read_only_mode":{"enabled":"Stranka je nastavena jen pro čtení. Můžete pokračovat v prohlížení ale interakce nemusí fungovat.","login_disabled":"Přihlášení je zakázáno jelikož fórum je v režimu jen pro čtení."},"learn_more":"více informací...","year":"rok","year_desc":"témata za posledních 365 dní","month":"měsíc","month_desc":"témata za posledních 30 dní","week":"týden","week_desc":"témata za posledních 7 dní","day":"den","first_post":"První příspěvek","mute":"Ignorovat","unmute":"Zrušit ignorování","last_post":"Poslední příspěvek","last_reply_lowercase":"poslední odpověď","replies_lowercase":{"one":"odpověď","few":"odpovědi","other":"odpovědí"},"summary":{"enabled_description":"Čtete shrnutí tohoto tématu: nejzajímavější příspěvky podle komunity.","description":"Obsahuje \u003cb\u003e{{count}}\u003c/b\u003e odpovědí.","description_time":"Obsahuje \u003cb\u003e{{count}}\u003c/b\u003e odpovědí o odhadovaném času čtení \u003cb\u003e{{readingTime}} minut\u003c/b\u003e.","enable":"Přepnout na \"nejlepší příspěvky\"","disable":"Přepnout na normální zobrazení"},"deleted_filter":{"enabled_description":"Toto téma obsahuje schované smazané příspěvky.","disabled_description":"Smazané příspěvky v tomto tématu jsou zobrazeny.","enable":"Schovat smazané příspěvky","disable":"Zobrazit smazané příspěvky"},"private_message_info":{"title":"Zpráva","invite":"pozvat účastníka","remove_allowed_user":"Určitě chcete odstranit {{name}} z této zprávy?"},"email":"Email","username":"Uživatelské jméno","last_seen":"Naposledy viděn","created":"Vytvořeno","created_lowercase":"vytvořeno","trust_level":"Důvěryhodnost","search_hint":"uživatelské jméno, email nebo IP adresa","create_account":{"title":"Vytvořit nový účet","failed":"Něco se nepovedlo, možná je tato e-mailová adresa již použita. Zkuste použít formulář pro obnovení hesla."},"forgot_password":{"title":"Obnovení hesla","action":"Zapomněl jsem své heslo","invite":"Vložte svoje uživatelské jméno nebo e-mailovou adresu a my vám zašleme postup pro obnovení hesla.","reset":"Resetovat heslo","complete_username":"Pokud nějaký účet odpovídá uživatelskému jménu \u003cb\u003e%{username}\u003c/b\u003e, obdržíte záhy email s instrukcemi jak dál postupovat v resetování hesla.","complete_email":"Pokud nějaký účet odpovídá emailu \u003cb\u003e%{email}\u003c/b\u003e, obdržíte záhy email s instrukcemi jak dál postupovat v resetování hesla.","complete_username_found":"Byl nalezen účet s uživatelským jménem \u003cb\u003e%{username}\u003c/b\u003e. Za chvilku obdržíte email s instrukcemi jak přenastavit vaše heslo.","complete_email_found":"Byl nalezen účet odpovídající emailu \u003cb\u003e%{email}\u003c/b\u003e. Za chvilku obdržíte email s instrukcemi jak přenastavit vaše heslo.","complete_username_not_found":"Nebyl nalezen účet s uživatelským jménem \u003cb\u003e%{username}\u003c/b\u003e","complete_email_not_found":"Nebyl nalezen účet s odpovídající emailu \u003cb\u003e%{email}\u003c/b\u003e"},"login":{"title":"Přihlásit se","username":"Uživatel","password":"Heslo","email_placeholder":"emailová adresa nebo uživatelské jméno","caps_lock_warning":"zapnutý Caps Lock","error":"Neznámá chyba","rate_limit":"Počkejte před dalším pokusem se přihlásit.","blank_username_or_password":"Vyplňte prosím email nebo uživatelské jméno, a heslo.","reset_password":"Resetovat heslo","logging_in":"Přihlašuji...","or":"Nebo","authenticating":"Autorizuji...","awaiting_confirmation":"Váš účet nyní čeká na aktivaci, použijte odkaz pro zapomené heslo, jestli chcete, abychom vám zaslali další aktivační email.","awaiting_approval":"Váš účet zatím nebyl schválen moderátorem. Až se tak stane, budeme vás informovat emailem.","requires_invite":"Promiňte, toto fórum je pouze pro zvané.","not_activated":"Ještě se nemůžete přihlásit. Zaslali jsme vám aktivační email v \u003cb\u003e{{sentTo}}\u003c/b\u003e. Prosím následujte instrukce v tomto emailu, abychom mohli váš účet aktivovat.","not_allowed_from_ip_address":"Z této IP adresy se nemůžete přihlásit.","admin_not_allowed_from_ip_address":"Z této IP adresy se nemůžete přihlásit jako administrátor.","resend_activation_email":"Klikněte sem pro zaslání aktivačního emailu.","sent_activation_email_again":"Zaslali jsme vám další aktivační email na \u003cb\u003e{{currentEmail}}\u003c/b\u003e. Může trvat několik minut, než vám dorazí. Zkontrolujte také vaši složku s nevyžádanou pošlou.","google":{"title":"přes Google","message":"Autorizuji přes Google (ujistěte se, že nemáte zablokovaná popup okna)"},"google_oauth2":{"title":"přes Google","message":"Přihlašování přes Google (ujistěte se že nemáte zaplé blokování pop up oken)"},"twitter":{"title":"přes Twitter","message":"Autorizuji přes Twitter (ujistěte se, že nemáte zablokovaná popup okna)"},"facebook":{"title":"přes Facebook","message":"Autorizuji přes Facebook (ujistěte se, že nemáte zablokovaná popup okna)"},"yahoo":{"title":"přes Yahoo","message":"Autorizuji přes Yahoo (ujistěte se, že nemáte zablokovaná popup okna)"},"github":{"title":"přes GitHub","message":"Autorizuji přes GitHub (ujistěte se, že nemáte zablokovaná popup okna)"}},"apple_international":"Apple/Mezinárodní","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","composer":{"emoji":"Emoji :smile:","add_warning":"Toto je oficiální varování.","posting_not_on_topic":"Rozepsali jste odpověď na téma \"{{title}}\", ale nyní máte otevřené jiné téma.","saving_draft_tip":"ukládá se...","saved_draft_tip":"uloženo","saved_local_draft_tip":"uloženo lokálně","similar_topics":"Podobná témata","drafts_offline":"koncepty offline","error":{"title_missing":"Název musí být vyplněn","title_too_short":"Název musí být dlouhý alespoň {{min}} znaků","title_too_long":"Název nemůže být delší než {{max}} znaků","post_missing":"Příspěvek nemůže být prázdný","post_length":"Příspěvek musí být alespoň {{min}} znaků dlouhý","try_like":"Zkusili jste tlačítko \u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e?","category_missing":"Musíte vybrat kategorii"},"save_edit":"Uložit změnu","reply_original":"Odpovědět na původní téma","reply_here":"Odpovědět sem","reply":"Odpovědět","cancel":"Zrušit","create_topic":"Vytvořit téma","create_pm":"Zpráva","title":"Nebo zmáčkněte Ctrl+Enter","users_placeholder":"Přidat uživatele","title_placeholder":"O čem je ve zkratce tato diskuze?","edit_reason_placeholder":"proč byla nutná úprava?","show_edit_reason":"(přidat důvod úpravy)","view_new_post":"Zobrazit váš nový příspěvek.","saved":"Uloženo!","saved_draft":"Máte rozepsaný příspěvek. Klikněte pro obnovení.","uploading":"Nahrávám...","show_preview":"zobrazit náhled \u0026raquo;","hide_preview":"\u0026laquo; skrýt náhled","quote_post_title":"Citovat celý příspěvek","bold_title":"Tučně","bold_text":"tučný text","italic_title":"Kurzíva","italic_text":"text kurzívou","link_title":"Odkazy","link_description":"sem vložte popis odkazu","link_dialog_title":"Vložit odkaz","link_optional_text":"volitelný popis","quote_title":"Bloková citace","quote_text":"Bloková citace","code_title":"Ukázka kódu","code_text":"odsadit předformátovaný text o 4 mezery","upload_title":"Obrázek","upload_description":"sem vložek popis obrázku","olist_title":"Číslovaný seznam","ulist_title":"Odrážkový seznam","list_item":"Položka seznam","heading_title":"Nadpis","heading_text":"Nadpis","hr_title":"Horizontální oddělovač","help":"Nápověda pro Markdown","toggler":"zobrazit nebo skrýt editor příspěvku","admin_options_title":"Volitelné administrační nastavení tématu","auto_close":{"label":"Automaticky zavřít téma za:","error":"Prosím zadejte platnou hodnotu.","based_on_last_post":"Neuzavírejte téma dokud poslední příspěvek v tomto tématu není alespoň takto starý.","all":{"examples":"Zadejte počet hodin (24), přesný čas (17:30) nebo časovou značku (2013-11-22 14:00)."},"limited":{"units":"(počet hodin)","examples":"Zadejte počet hodin (24)."}}},"notifications":{"title":"oznámení o zmínkách pomocí @name, odpovědi na vaše příspěvky a témata, zprávy, atd.","none":"Notifikace nebylo možné načíst.","more":"zobrazit starší oznámení","total_flagged":"celkem nahlášeno příspěvků","mentioned":"\u003ci title='mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='quoted' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='replied' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='edited' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='private message' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='invited to topic' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='accepted your invitation' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e přijal vaši pozvánku\u003c/p\u003e","moved_post":"\u003ci title='moved post' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e přesunul {{description}}\u003c/p\u003e","linked":"\u003ci title='linked post' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003eZískáno '{{description}}'\u003c/p\u003e","popup":{"mentioned":"{{username}} vás zmínil v \"{{topic}}\" - {{site_title}}","quoted":"{{username}} vás citoval v \"{{topic}}\" - {{site_title}}","replied":"{{username}} vám odpověděl v \"{{topic}}\" - {{site_title}}","posted":"{{username}} přispěl do \"{{topic}}\" - {{site_title}}","private_message":"{{username}} vám poslal soukromou zprávu v \"{{topic}}\" - {{site_title}}","linked":"{{username}} odkázal na vás příspěvek v \"{{topic}}\" - {{site_title}}"}},"upload_selector":{"title":"Vložit obrázek","title_with_attachments":"Nahrát obrázek nebo soubor","from_my_computer":"Z mého zařízení","from_the_web":"Z webu","remote_tip":"odkaz na obrázek","hint":"(můžete také rovnou soubor do editoru přetáhnout)","uploading":"Nahrávám","select_file":"Vyberte soubor","image_link":"adresa na kterou má váš obrázek odkazovat"},"search":{"title":"vyhledávat témata, příspěvky, uživatele nebo kategorie","no_results":"Nenalezeny žádné výsledky.","searching":"Hledám ...","post_format":"#{{post_number}} od {{username}}","context":{"user":"Vyhledat příspěvky od @{{username}}","category":"Vyhledat v kategorii „{{category}}“","topic":"Vyhledat v tomto tématu","private_messages":"Hledat ve zprávách"}},"go_back":"jít zpět","not_logged_in_user":"stránka uživatele s přehledem o aktuální činnosti a nastavení","current_user":"jít na vaši uživatelskou stránku","topics":{"bulk":{"reset_read":"reset přečteného","delete":"Smazat témata","dismiss_new":"Odbýt nová","toggle":"hromadný výběr témat","actions":"Hromadné akce","change_category":"Změnit kategorii","close_topics":"Zavřít téma","archive_topics":"Archivovat témata","notification_level":"Změnit úroveň upozornění","choose_new_category":"Zvolte novou kategorii pro témata:","selected":{"one":"Vybrali jste \u003cb\u003e1\u003c/b\u003e téma.","few":"Vybrali jste \u003cb\u003e{{count}}\u003c/b\u003e témata.","other":"Vybrali jste \u003cb\u003e{{count}}\u003c/b\u003e témat."}},"none":{"unread":"Nemáte žádná nepřečtená témata.","new":"Nemáte žádná nová témata ke čtení.","read":"Zatím jste nečetli žádná témata.","posted":"Zatím jste nepřispěli do žádného tématu.","latest":"Nejsou tu žádná témata z poslední doby. To je docela smutné.","hot":"Nejsou tu žádná populární témata.","bookmarks":"V tématech nemáte žádné záložky.","category":"V kategorii {{category}} nejsou žádná témata.","top":"Nejsou tu žádná populární témata.","search":"There are no search results.","educate":{"new":"\u003cp\u003eZde se zobrazují nová témata.\u003c/p\u003e\u003cp\u003ePodle výchozího nastavení jsou za nová témata považována ta, která byla vytvořena v posledních 2 dnech.\u003c/p\u003eU těch se ukáže ukazatel \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eNové\u003c/span\u003e.\u003cp\u003eMůžete to změnit ve vašem \u003ca href=\"%{userPrefsUrl}\"\u003enastavení\u003c/a\u003e.\u003c/p\u003e","unread":"\u003cp\u003eZde se zobrazují vaše nepřečtená témata.\u003c/p\u003e\u003cp\u003ePodle výchozího nastavení jsou za nepřečtená témata, ukterých se zobrazuje počet nepřečtení  \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e, považována ta, která jste:\u003c/p\u003e\u003cul\u003e\u003cli\u003eVytvořil toto téma\u003c/li\u003e\u003cli\u003eOdpovědětl v tématu\u003c/li\u003e\u003cli\u003eČetl téma více než 4 minuty\u003c/li\u003e\u003c/ul\u003e\u003cp\u003eNebo pokud jste nastavil téma jako Hlídané či Sledované pomocí nabídky na spodku každého tématu.\u003c/p\u003e\u003cp\u003eYou can change this in your \u003ca href=\"%{userPrefsUrl}\"\u003epreferences\u003c/a\u003e.\u003c/p\u003e"}},"bottom":{"latest":"Nejsou tu žádná další témata z poslední doby.","hot":"Nejsou tu žádná další populární témata k přečtení.","posted":"Nejsou tu žádná další zaslaná témata k přečtení.","read":"Nejsou tu žádná další přečtená témata.","new":"Nejsou tu žádná další nová témata k přečtení.","unread":"Nejsou tu žádná další nepřečtená témata.","category":"V kategorii {{category}} nejsou žádná další témata.","top":"Nejsou tu žádná další populární témata.","bookmarks":"Žádná další oblíbená témata nejsou k dispozici.","search":"There are no more search results."}},"topic":{"filter_to":"{{post_count}} příspěvků v tématu","create":"Nové téma","create_long":"Vytvořit nové téma","private_message":"Vytvořit zprávu","list":"Témata","new":"nové téma","unread":"nepřečtený","new_topics":{"one":"1 nové téma","few":"{{count}} nová témata","other":"{{count}} nových témat"},"unread_topics":{"one":"1 nepřečtené téma","few":"{{count}} nepřečtená témata","other":"{{count}} nepřečtených témat"},"title":"Téma","invalid_access":{"title":"Téma je soukromé","description":"Bohužel nemáte přístup k tomuto tématu.","login_required":"Musíte se přihlásit, abyste viděli toto téma."},"server_error":{"title":"Téma se nepodařilo načíst","description":"Bohužel není možné načíst toto téma, může to být způsobeno problémem s vaším připojením. Prosím, zkuste stránku načíst znovu. Pokud bude problém přetrvávat, dejte nám vědět."},"not_found":{"title":"Téma nenalezeno","description":"Bohužel se nám nepovedlo najít toto téma. Nebylo odstraněno moderátorem?"},"total_unread_posts":{"one":"máte 1 nepřečtený příspěvek v tomto tématu","few":"máte {{count}} nepřečtené příspěvky v tomto tématu.","other":"máte {{count}} nepřečtených příspěvků v tomto tématu."},"unread_posts":{"one":"máte 1 nepřečtený příspěvěk v tomto tématu","few":"máte {{count}} nepřečtené příspěvky v tomto tématu","other":"máte {{count}} nepřečtených příspěvků v tomto tématu"},"new_posts":{"one":"je zde 1 nový příspěvek od doby, kdy jste toto téma naposledy četli","few":"jsou zde {{count}} nové příspěvky od doby, kdy jste toto téma naposledy četli","other":"je zde {{count}} nových příspěvků od doby, kdy jste toto téma naposledy četli"},"likes":{"one":"v tomto tématu je jedno 'líbí se'","few":"v tomto tématu tématu je {{count}} 'líbí se'","other":"v tomto tématu tématu je {{count}} 'líbí se'"},"back_to_list":"Zpátky na seznam témat","options":"Možnosti","show_links":"zobrazit odkazy v tomto tématu","toggle_information":"zobrazit/skrýt detaily tématu","read_more_in_category":"Chcete si toho přečíst víc? Projděte si témata v {{catLink}} nebo {{latestLink}}.","read_more":"Chcete si přečíst další informace? {{catLink}} nebo {{latestLink}}.","browse_all_categories":"Projděte všechny kategorie","view_latest_topics":"si zobrazte populární témata","suggest_create_topic":"Co takhle založit nové téma?","jump_reply_up":"přejít na předchozí odpověď","jump_reply_down":"přejít na následující odpověď","deleted":"Téma bylo smazáno","auto_close_notice":"Toto téma se automaticky zavře %{timeLeft}.","auto_close_notice_based_on_last_post":"Toto téma se uzavře za %{duration} po poslední odpovědi.","auto_close_title":"Nastavení automatického zavření","auto_close_save":"Uložit","auto_close_remove":"Nezavírat téma automaticky","progress":{"title":"pozice v tématu","go_top":"nahoru","go_bottom":"dolů","go":"go","jump_bottom":"na poslední příspěvek","jump_bottom_with_number":"Skočit na příspěvěk %{post_number}","total":"celkem příspěvků","current":"aktuální příspěvek","position":"příspěvek %{current} z %{total}"},"notifications":{"reasons":{"3_6":"Budete dostávat oznámení, protože hlídáte tuhle kategorii.","3_5":"Budete dostávat oznámení, protože jste tohle téma automaticky začali hlídat.","3_2":"Budete dostávat oznámení, protože hlídáte toto téma.","3_1":"Budete dostávat oznámení, protože jste autorem totoho tématu.","3":"Budete dostávat oznámení, protože hlídáte toto téma.","2_8":"Budete dostávat upozornění, protože sledujete tuto kategorii.","2_4":"Budete dostávat oznámení, protože jste zaslal odpověď do tohoto tématu.","2_2":"Budete dostávat oznámení, protože sledujete toto téma.","2":"Budete dostávat oznámení, protože \u003ca href=\"/users/{{username}}/preferences\"\u003ejste četli toto téma\u003c/a\u003e.","1_2":"Budete informováni pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek.","1":"Budete informováni pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek.","0_7":"Ignorujete všechna oznámení v této kategorii.","0_2":"Ignorujete všechna oznámení z tohoto tématu.","0":"Ignorujete všechna oznámení z tohoto tématu."},"watching_pm":{"title":"Hlídání","description":"Budete informováni o každém novém příspěvku v této zprávě. Vedle názvu tématu se objeví počet nepřečtených příspěvků."},"watching":{"title":"Hlídané","description":"Budete informováni o každém novém příspěvku v tomto tématu. Vedle názvu tématu se objeví počet nepřečtených příspěvků."},"tracking_pm":{"title":"Sledování","description":"U této zprávy se zobrazí počet nových příspěvků. Budete upozorněni, pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek."},"tracking":{"title":"Sledované","description":"U tohoto tématu se zobrazí počet nových příspěvků. Budete upozorněni, pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek."},"regular":{"description":"Budete informováni pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek."},"regular_pm":{"description":"Budete informováni pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek."},"muted_pm":{"title":"Ztišení","description":"Nikdy nedostanete oznámení týkající se čehokoliv v této zprávě."},"muted":{"title":"Ztišené"}},"actions":{"recover":"Vrátit téma","delete":"Odstranit téma","open":"Otevřít téma","close":"Zavřít téma","multi_select":"Zvolte příspěvky…","auto_close":"Automaticky zavřít","pin":"Připevnit téma","unpin":"Odstranit připevnění","unarchive":"Navrátit z archivu","archive":"Archivovat téma","invisible":"Zneviditelnit","visible":"Zviditelnit","reset_read":"Vynulovat počet čtení"},"feature":{"pin":"Připevnit téma","unpin":"Odstranit připevnění","pin_globally":"Připnout téma globálně","make_banner":"Banner Topic","remove_banner":"Remove Banner Topic"},"reply":{"title":"Odpovědět","help":"začněte psát odpověď na toto téma"},"clear_pin":{"title":"Odstranit připnutí","help":"Odebere připnutí tohoto tématu, takže se již nebude zobrazovat na vrcholu seznamu témat"},"share":{"title":"Sdílet","help":"sdílet odkaz na toto téma"},"flag_topic":{"title":"Nahlásit","help":"Soukromě nahlásit tento příspěvek moderátorům","success_message":"Téma úspěšně nahlášeno."},"feature_topic":{"title":"Povýšit téma","confirm_pin":"Již máte {{count}} připevněných příspěvků. Příliš mnoho připevněných příspěvků může zatěžovat nové nebo anonymní uživatele. Určitě chcete připevnit další téma v této kategorii?","unpin":"Odstranit toto téma z vrcholu {{categoryLink}} kategorie.","pin_note":"Uživatelé mohou odepnout téma sami pro sebe.","confirm_pin_globally":"Již máte {{count}} globálně připevněných příspěvků. Příliš mnoho připevněných příspěvků může zatěžovat nové nebo anonymní uživatele. Určitě chcete připevnit další téma globálně?","unpin_globally":"Odstranit toto téma z vrcholu všech seznamů s tématy.","global_pin_note":"Uživatelé mohou odepnout téma sami pro sebe.","make_banner":"Udělat z tohoto tématu banner, který se zobrazí na vrcholu všech stránek.","remove_banner":"Odstranit banner, který se zobrazuje na vrcholu všech stránek.","banner_note":"Uživatelé mohou odmítnout banner jeho zavřením. V jeden moment může být pouze jedno téma jako banner."},"inviting":"Odesílám pozvánku...","automatically_add_to_groups_optional":"Tato pozvánka obsahuje také přístup do této skupiny: (volitelné, pouze administrátor)","automatically_add_to_groups_required":"Tato pozvánka obsahuje také přístup do těchto skupin: (\u003cb\u003eVyžadováno\u003c/b\u003e, pouze administrátor)","invite_private":{"title":"Pozvat do konverzace","email_or_username":"Email nebo uživatelské jméno pozvaného","email_or_username_placeholder":"emailová adresa nebo uživatelské jméno","action":"Pozvat","success":"Pozvali jsme tohoto uživatele, aby se připojil do této zprávy.","error":"Bohužel nastala chyba při odesílání pozvánky.","group_name":"název skupiny"},"invite_reply":{"title":"Pozvat k diskuzi","username_placeholder":"uživatelské jméno","action":"Poslat pozvánku","help":"pozval ostatní do tohoto tématu pomocí emailu nebo notifikací","to_forum":"Pošleme krátký email dovolující vašemu příteli se okamžitě zapojit s pomocí kliknutí na odkaz. Nebude potřeba registrace.","sso_enabled":"Zadej uživatelské jméno člověka, kterého chceš pozvat do tohoto tématu.","to_topic_blank":"Zadej uživatelské jméno a email člověka, kterého chceš pozvat do tohoto tématu.","to_topic_email":"Zadal jste emailovou adresu. Pošleme na ni pozvánku, s jejíž pomocí bude moci váš kamarád ihned odpovědět do tohoto tématu.","to_topic_username":"Zadali jste uživatelské jméno. Zašleme pozvánku s odkazem do tohoto tématu.","to_username":"Zadejte uživatelské jméno člověka, kterého chcete pozvat. Zašleme pozvánku s odkazem do tohoto tématu.","email_placeholder":"jmeno@priklad.cz","success_email":"Zaslali jsme pozvánku na \u003cb\u003e{{emailOrUsername}}\u003c/b\u003e. Upozorníme vás až bude pozvánka použita. Své pozvánky můžete sledovat v tabulce pozvánek na svém uživatelském profilu.","success_username":"Pozvali jsme zadaného uživatele, aby se zúčastnil tématu.","error":"Bohužel se nepodařilo pozvat tuto osobu. Možná už byla pozvána? (Počet opakovaných pozvánek je omezen)."},"login_reply":"Přihlaste se, chcete-li odpovědět","filters":{"n_posts":{"one":"Je zobrazen pouze 1 příspěvek","few":"Jsou zobrazeny pouze {{count}} příspěvky","other":"Je zobrazeno pouze {{count}} příspěvků"},"cancel":"Zrušit filtr"},"split_topic":{"title":"Rozdělit téma","action":"do nového téma","topic_name":"Název nového tématu:","error":"Bohužel nastala chyba při rozdělování tématu.","instructions":{"one":"Chystáte se vytvořit nové téma a naplnit ho příspěvkem, který jste označili.","few":"Chystate se vytvořit noté téma a naplnit ho \u003cb\u003e{{count}}\u003c/b\u003e příspěvky, které jste označili.","other":"Chystate se vytvořit noté téma a naplnit ho \u003cb\u003e{{count}}\u003c/b\u003e příspěvky, které jste označili."}},"merge_topic":{"title":"Sloučit téma","action":"do jiného tématu","error":"Bohužel nastala chyba při slučování tématu.","instructions":{"one":"Prosím, vyberte téma, do kterého chcete příspěvek přesunout.","few":"Prosím, vyberte téma, do kterého chcete tyto \u003cb\u003e{{count}}\u003c/b\u003e příspěvky přesunout.","other":"Prosím, vyberte téma, do kterého chcete těchto \u003cb\u003e{{count}}\u003c/b\u003e příspěvků přesunout."}},"change_owner":{"title":"Změnit autora","action":"změna autora","error":"Chyba při měnění autora u příspevků.","label":"Nový autor příspěvků","placeholder":"uživatelské jméno nového autora","instructions":{"one":"Vyberte prosím nového autora příspěvku od \u003cb\u003e{{old_user}}\u003c/b\u003e.","few":"Vyberte prosím nového autora {{count}} příspěvků od \u003cb\u003e{{old_user}}\u003c/b\u003e.","other":"Vyberte prosím nového autora {{count}} příspěvků od \u003cb\u003e{{old_user}}\u003c/b\u003e."},"instructions_warn":"Poznámka: Žádná upozornění na tento příspěvek nebudou zpětně přenesena na nového uživatele.\u003cbr\u003eVarování: V současné chvíli, žádná data svázaná s příspěvkem nebudou přenesena na nového uživatele. Používejte opatrně."},"multi_select":{"select":"vybrat","selected":"vybráno ({{count}})","select_replies":"vybrat +odpovědi","delete":"smazat označené","cancel":"zrušit označování","select_all":"vybrat vše","deselect_all":"zrušit výběr","description":{"one":"Máte označen \u003cb\u003e1\u003c/b\u003e příspěvek.","few":"Máte označeny \u003cb\u003e{{count}}\u003c/b\u003e příspěvky.","other":"Máte označeno \u003cb\u003e{{count}}\u003c/b\u003e příspěvků."}}},"post":{"quote_reply":"odpověď s citací","edit":"Editujete {{link}} {{replyAvatar}} {{username}}","edit_reason":"Důvod: ","post_number":"příspěvek č. {{number}}","last_edited_on":"příspěvek naposledy upraven","reply_as_new_topic":"Odpovědět v propojeném tématu","continue_discussion":"Pokračující diskuze z {{postLink}}:","follow_quote":"přejít na citovaný příspěvek","show_full":"Zobrazit celý příspěvek","show_hidden":"Zobraz skrytý obsah.","deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)","few":"(post withdrawn by author, will be automatically deleted in %{count} hours unless flagged)","other":"(post withdrawn by author, will be automatically deleted in %{count} hours unless flagged)"},"expand_collapse":"rozbalit/sbalit","gap":{"one":"zobrazit 1 skrytou odpověď","few":"zobrazit {{count}} skryté odpovědi","other":"zobrazit {{count}} skrytých odpovědí"},"more_links":"{{count}} dalších...","unread":"Příspěvek je nepřečtený.","has_replies":{"one":"{{count}} odpověď","few":"{{count}} odpovědi","other":"{{count}} odpovědí"},"has_likes":{"one":"{{count}} líbí se mi","few":"{{count}} líbí se mi","other":"{{count}} líbí se mi"},"has_likes_title":{"one":"1 člověku se líbí tento příspěvek","few":"{{count}} lidem se líbí tento příspěvek","other":"{{count}} lidem se líbí tento příspěvek"},"errors":{"create":"Bohužel nastala chyba při vytváření příspěvku. Prosím zkuste to znovu.","edit":"Bohužel nastala chyba při editaci příspěvku. Prosím zkuste to znovu.","upload":"Bohužel nastala chyba při nahrávání příspěvku. Prosím zkuste to znovu.","attachment_too_large":"Soubor, který se snažíte nahrát je bohužel příliš velký (maximální velikost je {{max_size_kb}}kb). Prosím zmenšete ho zkuste to znovu.","file_too_large":"Omlouváme se, ale soubor, který se snažíte nahrát, je příliš veliký (maximální velikost je {{max_size_kb}}kb)","too_many_uploads":"Bohužel, najednou smíte nahrát jen jeden soubor.","too_many_dragged_and_dropped_files":"Eh, pardon, ale můžete najednou nahrát nanejvýš 10 souborů.","upload_not_authorized":"Bohužel, soubor, který se snažíte nahrát, není povolený (povolené přípony: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Bohužel, noví uživatelé nemohou nahrávat obrázky.","attachment_upload_not_allowed_for_new_user":"Bohužel, noví uživatelé nemohou nahrávat přílohy.","attachment_download_requires_login":"Omlouváme se, ale pro stáhnutí přílohy musíte být přihlášen."},"abandon":{"confirm":"Opravdu chcete svůj příspěvek zahodit?","no_value":"Nezahazovat","yes_value":"Ano, zahodit"},"via_email":"tento příspěvek byl přijat přes email","wiki":{"about":"tento příspěvek je wiki; běžní uživatelé jej mohou editovat"},"archetypes":{"save":"Uložit nastavení"},"controls":{"reply":"otevře okno pro sepsání odpovědi na tento příspěvek","like":"to se mi líbí","has_liked":"tento příspěvek se mi líbí","undo_like":"už se mi to nelíbí","edit":"upravit příspěvek","edit_anonymous":"Omlouváme se, ale pro editaci tohoto příspěvku musíte být přihlášení.","flag":"nahlásit příspěvek moderátorovi","delete":"smazat příspěvek","undelete":"obnovit příspěvek","share":"sdílet odkaz na tento příspěvek","more":"Více","delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?","few":"Do you also want to delete the {{count}} direct replies to this post?","other":"Do you also want to delete the {{count}} direct replies to this post?"},"yes_value":"Ano, smazat i odpovědi","no_value":"Ne, jenom tento příspěvek"},"admin":"post admin actions","wiki":"Vytvořte Wiki","unwiki":"Odtraňte Wiki","convert_to_moderator":"Přidejte Staff Color","revert_to_regular":"Odstraňte Staff Color","rebake":"Obnovit HTML","unhide":"Odkrýt"},"actions":{"flag":"Nahlásit","defer_flags":{"one":"Odložit nahlášení","few":"Odložit nahlášení","other":"Odložit nahlášení"},"it_too":{"off_topic":"Také nahlásit","spam":"Také nahlásit","inappropriate":"Také nahlásit","custom_flag":"Také nahlásit","bookmark":"Také přidat do záložek","like":"To se mi také líbí","vote":"Hlasovat také"},"undo":{"off_topic":"Zrušit nahlášení","spam":"Zrušit nahlášení","inappropriate":"Zrušit nahlášení","bookmark":"Odebrat ze záložek","like":"Už se mi to nelíbí","vote":"Zrušit hlas"},"people":{"off_topic":"{{icons}} označili tento příspěvek jako off-topic","spam":"{{icons}} označili tento příspěvek jako spam","spam_with_url":"{{icons}} označení \u003ca href='{{postUrl}}'\u003ejako spam\u003c/a\u003e","inappropriate":"{{icons}} označili tento příspěvek jako nevhodný","notify_moderators":"{{icons}} nahlásili tento příspěvek","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003enahlásili tento příspěvek\u003c/a\u003e","notify_user":"{{icons}} poslal zprávu","notify_user_with_url":"{{icons}} poslal \u003ca href='{{postUrl}}'\u003ezprávu\u003c/a\u003e","bookmark":"{{icons}} si přidali příspěvek do záložek","like":"{{icons}} se líbí tento příspěvek","vote":"{{icons}} hlasovali pro tento příspěvek"},"by_you":{"off_topic":"Označili jste tento příspěvek jako off-topic","spam":"Označili jste tento příspěvek jako spam","inappropriate":"Označili jste tento příspěvek jako nevhodný","notify_moderators":"Nahlásili jste tento příspěvek","notify_user":"Tomuto uživateli jste zaslali zprávu","bookmark":"Přidali jste si tento příspěvek do záložek","like":"Toto se vám líbí","vote":"Hlasovali jste pro tento příspěvek"},"by_you_and_others":{"off_topic":{"one":"Vy a 1 další člověk jste označili tento příspěvek jako off-topic","few":"Vy a {{count}} další lidé jste označili tento příspěvek jako off-topic","other":"Vy a {{count}} dalších lidí jste označili tento příspěvek jako off-topic"},"spam":{"one":"Vy a 1 další člověk jste označili tento příspěvek jako spam","few":"Vy a {{count}} další lidé jste označili tento příspěvek jako spam","other":"Vy a {{count}} dalších lidí jste označili tento příspěvek jako spam"},"inappropriate":{"one":"Vy a 1 další člověk jste označili tento příspěvek jako nevhodný","few":"Vy a {{count}} další lidé jste označili tento příspěvek jako nevhodný","other":"Vy a {{count}} dalších lidí jste označili tento příspěvek jako nevhodný"},"notify_moderators":{"one":"Vy a 1 další člověk jste nahlásili tento příspěvek","few":"Vy a {{count}} další lidé jste nahlásili tento příspěvek","other":"Vy a {{count}} dalších lidí jste nahlásili tento příspěvek"},"notify_user":{"one":"Vy a 1 další uživatel jste poslali zprávu tomuto uživateli","few":"Vy a {{count}} ostatní lidé jste poslali zprávu tomuto uživateli","other":"Vy a {{count}} ostatních lidí jste poslali zprávu tomuto uživateli"},"bookmark":{"one":"Vy a 1 další člověk jste si přidali tento příspěvek do záložek","few":"Vy a {{count}} další lidé jste si přidali tento příspěvek do záložek","other":"Vy a {{count}} dalších lidí si přidali tento příspěvek do záložek"},"like":{"one":"Vám a 1 dalšímu člověku se tento příspěvek líbí","few":"Vám a {{count}} dalším lidem se tento příspěvek líbí","other":"Vám a {{count}} dalším lidem se tento příspěvek líbí"},"vote":{"one":"Vy a 1 další člověk jste hlasovali pro tento příspěvek","few":"Vy a {{count}} další lidé jste hlasovali pro tento příspěvek","other":"Vy a {{count}} dalších lidí jste hlasovali pro tento příspěvek"}},"by_others":{"off_topic":{"one":"1 člověk označil tento příspěvek jako off-topic","few":"{{count}} lidé označili tento příspěvek jako off-topic","other":"{{count}} lidí označilo tento příspěvek jako off-topic"},"spam":{"one":"1 člověk označil tento příspěvek jako spam","few":"{{count}} lidé označili tento příspěvek jako spam","other":"{{count}} lidí označilo tento příspěvek jako spam"},"inappropriate":{"one":"1 člověk označil tento příspěvek jako nevhodný","few":"{{count}} lidé označili tento příspěvek jako nevhodný","other":"{{count}} lidí označilo tento příspěvek jako nevhodný"},"notify_moderators":{"one":"1 člověk nahlásil tento příspěvek","few":"{{count}} lidé nahlásili tento příspěvek","other":"{{count}} lidí nahlásilo tento příspěvek"},"notify_user":{"one":"1 člověk poslal zprávu tomuto uživateli","few":"{{count}} lidé poslali zprávu tomuto uživateli","other":"{{count}} lidí poslalo zprávu tomuto uživateli"},"bookmark":{"one":"1 člověk si přidal tento příspěvek do záložek","few":"{{count}} lidé si přidali tento příspěvek do záložek","other":"{{count}} lidí si přidalo tento příspěvek do záložek"},"like":{"one":"1 člověku se tento příspěvek líbí","few":"{{count}} lidem se tento příspěvek líbí","other":"{{count}} lidem se tento příspěvek líbí"},"vote":{"one":"1 člověk hlasoval pro tento příspěvek","few":"{{count}} lidé hlasovali pro tento příspěvek","other":"{{count}} lidí hlasovalo pro tento příspěvek"}}},"delete":{"confirm":{"one":"Opravdu chcete odstranit tento příspěvek?","few":"Opravdu chcete odstranit všechny tyto příspěvky?","other":"Opravdu chcete odstranit všechny tyto příspěvky?"}},"revisions":{"controls":{"first":"První revize","previous":"Předchozí revize","next":"Další revize","last":"Poslední revize","hide":"Schovejte revizi","show":"Zobrazte revizi","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"Vykreslený příspěvek se změnami zobrazenými v textu","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"Rozdíli mezi vykreslenými příspěveky vedle sebe","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"Show the raw source diffs side-by-side","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Kód"}}}},"category":{"can":"smí\u0026hellip; ","none":"(bez kategorie)","all":"Všechny kategorie","choose":"Vyberte kategorii\u0026hellip;","edit":"upravit","edit_long":"Upravit","view":"Zobrazit témata v kategorii","general":"Základní","settings":"Nastavení","topic_template":"Šablona tématu","delete":"Smazat kategorii","create":"Nová kategorie","save":"Uložit kategorii","slug":"Odkaz kategorie","slug_placeholder":"(Dobrovolné) podtržená URL","creation_error":"Během vytváření nové kategorie nastala chyba.","save_error":"Během ukládání kategorie nastala chyba.","name":"Název kategorie","description":"Popis","topic":"téma kategorie","logo":"Logo kategorie","background_image":"Obrázek na pozadí této kategorie","badge_colors":"Barvy štítku","background_color":"Barva pozadí","foreground_color":"Barva textu","name_placeholder":"Měl by být krátký a výstižný.","color_placeholder":"Jakákoliv webová barva","delete_confirm":"Opravdu chcete odstranit tuto kategorii?","delete_error":"Nastala chyba při odstraňování kategorie.","list":"Seznam kategorií","no_description":"Doplňte prosím popis této kategorie.","change_in_category_topic":"navštivte téma kategorie pro editaci jejího popisu","already_used":"Tato barva je již použita jinou kategorií","security":"Zabezpečení","images":"Obrázky","auto_close_label":"Automaticky zavírat témata po:","auto_close_units":"hodinách","email_in":"Vlastní příchozí emailová adresa:","email_in_allow_strangers":"Přijímat emaily i od neregistrovaných uživatelů","email_in_disabled":"Přidávání nových témat před email je zakázáno v Nastavení fóra. K povolení nových témat přes email,","email_in_disabled_click":"povolit nastavení \"email in\"","allow_badges_label":"Povolit používání odznaků v této kategorii","edit_permissions":"Upravit oprávnění","add_permission":"Přidat oprávnění","this_year":"letos","position":"umístění","default_position":"Výchozí umístění","position_disabled":"Kategorie jsou zobrazovány podle pořadí aktivity. Pro kontrolu pořadí kategorií v seznamech,","position_disabled_click":"povolte nastavení \"neměnné pozice kategorií\" (fixed category positions).","parent":"Nadřazená kategorie","notifications":{"watching":{"title":"Hlídání"},"tracking":{"title":"Sledování"},"regular":{"description":"Budete informováni pokud někdo zmíní vaše @jméno nebo odpoví na váš příspěvek."},"muted":{"title":"Ztišený"}}},"flagging":{"title":"Děkujeme, že pomáháte udržovat komunitu zdvořilou!","private_reminder":"nahlášení jsou soukromá, viditelná \u003cb\u003epouze\u003c/b\u003e pro správce","action":"Nahlásit příspěvek","take_action":"Zakročit","notify_action":"Zpráva","delete_spammer":"Odstranit spamera","delete_confirm":"Chystáte se odstranit \u003cb\u003e%{posts}\u003c/b\u003e příspěvků a \u003cb\u003e%{topics}\u003c/b\u003e témat od tohoto uživatele, smazat jeho účet, a vložit jeho emailovou adresu \u003cb\u003e%{email}\u003c/b\u003e na seznam permanentně blokovaných. Jste si jistí, že je tento uživatel opravdu spamer?","yes_delete_spammer":"Ano, odstranit spamera","ip_address_missing":"(N/A)","hidden_email_address":"(skrytý)","submit_tooltip":"Podat soukromé nahlášení","cant":"Bohužel nyní nemůžete tento příspěvek nahlásit.","formatted_name":{"off_topic":"Je to mimo téma.","inappropriate":"Je to nevhodné","spam":"Je to spam"},"custom_placeholder_notify_user":"Buďte věcný, konstruktivní a vždy zdvořilý.","custom_placeholder_notify_moderators":"Sdělte nám, co vás přesně trápí a kde to bude možné, tak nám poskytněte související odkazy a příklady.","custom_message":{"at_least":"zadejte alespoň {{n}} znaků","more":"ještě {{n}}...","left":"{{n}} zbývá"}},"flagging_topic":{"title":"Děkujeme, že pomáháte udržovat komunitu zdvořilou!","action":"Nahlásit téma","notify_action":"Zpráva"},"topic_map":{"title":"Souhrn tématu","participants_title":"Častí přispěvatelé","links_title":"Populární odkazy","links_shown":"zobrazit všech {{totalLinks}} odkazů...","clicks":{"one":"1 kliknutí","few":"%{count} kliknutí","other":"%{count} kliknutí"}},"topic_statuses":{"warning":{"help":"Toto je oficiální varování."},"bookmarked":{"help":"V tématu je vložena záložka"},"locked":{"help":"toto téma je uzavřené; další odpovědi nejsou přijímány"},"archived":{"help":"toto téma je archivováno; je zmraženo a nelze ho již měnit"},"unpinned":{"title":"Nepřipnuté","help":"Pro vás toto téma není připnuté; bude se zobrazovat v běžném pořadí"},"pinned_globally":{"title":"Připnuté globálně"},"pinned":{"title":"Připnuto","help":"Pro vás je toto téma připnuté; bude se zobrazovat na vrcholu seznamu ve své kategorii"},"invisible":{"help":"Toto téma je neviditelné; nebude se zobrazovat v seznamu témat a lze ho navštívit pouze přes přímý odkaz"}},"posts":"Příspěvků","posts_lowercase":"příspěvky","posts_long":"v tomto tématu je {{number}} příspěvků","original_post":"Původní příspěvek","views":"Zobrazení","views_lowercase":{"one":"zobrazení","few":"zobrazení","other":"zobrazení"},"replies":"Odpovědi","views_long":"toto téma bylo zobrazeno {{number}}krát","activity":"Aktivita","likes":"Líbí se","likes_lowercase":{"one":"líbí se","few":"líbí se","other":"líbí se"},"likes_long":"v tomto tématu je {{number}} 'líbí se'","users":"Účastníci","users_lowercase":{"one":"uživatel","few":"uživatelé","other":"uživatelů"},"category_title":"Kategorie","history":"Historie","changed_by":"od uživatele {{author}}","raw_email":{"title":"Neupravený email","not_available":"Není k dispozici!"},"categories_list":"Seznam kategorií","filters":{"with_topics":"%{filter} témata","with_category":"%{filter} %{category} témata","latest":{"help":"nejaktuálnější témata"},"hot":{"title":"Populární","help":"populární témata z poslední doby"},"read":{"title":"Přečtená","help":"témata, která jste si přečetli"},"search":{"title":"Vyhledat","help":"prohledat všechna témata"},"categories":{"title":"Kategorie","title_in":"Kategorie - {{categoryName}}","help":"všechna témata seskupená podle kategorie"},"unread":{"help":"témata. která sledujete nebo hlídáte, s nepřečtenými příspěvky"},"new":{"lower_title":"nové","help":"témata vytvořená za posledních několik dní"},"posted":{"title":"Mé příspěvky","help":"témata, do kterých jste přispěli"},"bookmarks":{"title":"Záložky","help":"témata, do kterých jste si vložili záložku"},"category":{"help":"populární témata v kategorii {{categoryName}}"},"top":{"title":"Nejlepší","help":"výběr nejlepších témat za rok, měsíc, týden nebo den","all":{"title":"Za celou dobu"},"yearly":{"title":"Ročně"},"monthly":{"title":"Měsíčně"},"weekly":{"title":"Týdně"},"daily":{"title":"Denně"},"all_time":"Za celou dobu","this_year":"Rok","this_month":"Měsíc","this_week":"Týden","today":"Dnes","other_periods":"viz nahoře"}},"browser_update":"Bohužel, \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003eváš prohlížeč je příliš starý, aby na něm Discourse mohl fungovat\u003c/a\u003e. Prosím \u003ca href=\"http://browsehappy.com\"\u003eaktualizujte svůj prohlížeč\u003c/a\u003e.","permission_types":{"full":"Vytvářet / Odpovídat / Prohlížet","create_post":"Odpovídat / Prohlížet","readonly":"Prohlížet"},"poll":{"voters":{"one":"hlasující","few":"hlasujících","other":"hlasující"},"total_votes":{"one":"hlas celkem","few":"hlasy celkem","other":"hlasů celkem"},"average_rating":"Průměrné hodnocení: \u003cstrong\u003e%{average}\u003c/strong\u003e.","cast-votes":{"title":"Hlasujte","label":"Hlasovat!"},"show-results":{"title":"Zobraz výsledky hlasování.","label":"Ukaž výsledky."},"hide-results":{"title":"Zpět k hlasování","label":"Schovej výsledky."},"open":{"title":"Otevřít hlasování","label":"Otevři","confirm":"Opravdu chcete otevřít toto hlasování?"},"close":{"title":"Zavřít hlasování.","label":"Zavřít","confirm":"Opravdu chcete uzavřít toto hlasování?"},"error_while_casting_votes":"Objevila se chyba při zpracování Vašeho hlasu."},"type_to_filter":"text pro filtrování...","admin":{"title":"Administrátor","moderator":"Moderátor","dashboard":{"title":"Rozcestník","last_updated":"Přehled naposled aktualizován:","version":"Verze Discourse","up_to_date":"Máte aktuální!","critical_available":"Je k dispozici důležitá aktualizace.","updates_available":"Jsou k dispozici aktualizace.","please_upgrade":"Prosím aktualizujte!","no_check_performed":"Kontrola na aktualizace nebyla provedena. Ujistěte se, že běží služby sidekiq.","stale_data":"V poslední době neproběhal kontrola aktualizací. Ujistěte se, že běží služby sidekiq.","version_check_pending":"Že tys nedávno provedl aktualizaci. Báječné!","installed_version":"Nainstalováno","latest_version":"Poslední verze","problems_found":"Byly nalezeny problémy s vaší instalací systému Discourse:","last_checked":"Naposledy zkontrolováno","refresh_problems":"Obnovit","no_problems":"Nenalezeny žádné problémy.","moderators":"Moderátoři:","admins":"Administrátoři:","blocked":"Blokováno:","suspended":"Zakázáno:","private_messages_short":"Msgs","private_messages_title":"Zprávy","mobile_title":"Mobilní verze","space_free":"{{size}} prázdné","uploads":"Nahrané soubory","backups":"zálohy","traffic_short":"Provoz","traffic":"Webové požadavky na aplikaci","page_views":"API požadavky","page_views_short":"API požadavky","show_traffic_report":"Zobrazit detailní zprávu o provozu","reports":{"today":"Dnes","yesterday":"Včera","last_7_days":"Týden","last_30_days":"Měsíc","all_time":"Za celou dobu","7_days_ago":"Týden","30_days_ago":"Měsíc","all":"Celkem","view_table":"tabulka","view_chart":"sloupcový graf","refresh_report":"Obnovit hlášení","start_date":"Datum začátku","end_date":"Datum konce"}},"commits":{"latest_changes":"Poslední změny:","by":"od"},"flags":{"title":"Nahlášení","old":"Stará","active":"Aktivní","agree":"Schválit","agree_title":"Potvrdit toto hlášení jako právoplatné a korektní","agree_flag_modal_title":"Schvaluji a...","agree_flag_hide_post":"Schvaluji (skrýt příspěvek + poslat soukromou zprávu)","agree_flag_hide_post_title":"Skrýt tento příspěvek a automaticky odeslat zprávu, která uživatele žádá o editaci","agree_flag_restore_post":"Schvaluji (obnovit příspěvek)","agree_flag_restore_post_title":"Obnovit tento příspěvek","agree_flag":"Souhlasit s hlášením","agree_flag_title":"Schválit hlášení a nechat příspěvek nezměněný","defer_flag":"Odložit","defer_flag_title":"Odstranit nahlášení; teď nevyžaduje žádné opatření.","delete":"Smazat","delete_title":"Smazat příspěvek, na který toto hlášení odkazuje.","delete_post_defer_flag":"Smazat příspěvek a odložit nahlášení","delete_post_defer_flag_title":"Smazat příspěvek; pokud je to první příspěvek, tak smazat téma","delete_post_agree_flag":"Smazat příspěvek a Schválit hlášení","delete_post_agree_flag_title":"Smazat příspěvek; pokud je to první příspěvek, tak smazat téma","delete_flag_modal_title":"Smazat a...","delete_spammer":"Odstranit spamera","delete_spammer_title":"Odstranit uživatele a všechny příspěvky a témata tohoto uživatele.","disagree_flag_unhide_post":"Neschvaluji (zviditelnit příspěvek)","disagree_flag_unhide_post_title":"Odstranit všechna nahlášení u tohoto příspěvku a znovu ho zviditelnit","disagree_flag":"Neschvaluji","disagree_flag_title":"Odmítnout hlášení jako neprávoplatné a nekorektní","clear_topic_flags":"Hotovo","clear_topic_flags_title":"The topic has been investigated and issues have been resolved. Click Done to remove the flags.","more":"(více odpovědí...)","dispositions":{"agreed":"schváleno","disagreed":"neschváleno","deferred":"odloženo"},"flagged_by":"Nahlásil","resolved_by":"Vyřešeno","took_action":"Zakročit","system":"Systémové soukromé zprávy","error":"Něco se pokazilo","reply_message":"Odpovědět","no_results":"Nejsou zde žádná nahlášení.","topic_flagged":"Tohle \u003cstrong\u003etéma\u003c/strong\u003e bylo označeno.","visit_topic":"Zobrazit téma pro přijmutí opatření.","was_edited":"Příspěvek byl upraven po prvním nahlášení","previous_flags_count":"Tento příspěvek byl již nahlášen {{count}} krát.","summary":{"action_type_3":{"one":"off-topic","few":"off-topic x{{count}}","other":"off-topic x{{count}}"},"action_type_4":{"one":"nevhodné","few":"nevhodné x{{count}}","other":"nevhodné x{{count}}"},"action_type_6":{"one":"spam","few":"spam x{{count}}","other":"spam x{{count}}"},"action_type_7":{"one":"vlastní","few":"vlastní x{{count}}","other":"vlastní x{{count}}"},"action_type_8":{"one":"spam","few":"spam x{{count}}","other":"spam x{{count}}"}}},"groups":{"primary":"Hlavní skupina","no_primary":"(žádná hlavní skupina)","title":"Skupiny","edit":"Upravit skupiny","refresh":"Obnovit","new":"Nová","selector_placeholder":"zadejte uživatelské jméno","name_placeholder":"Název skupiny, bez mezer, stejná pravidla jako pro uživatelská jména","about":"Zde můžete upravit názvy skupin a členství","group_members":"Členové skupiny","delete":"Smazat","delete_confirm":"Smazat toto skupiny?","delete_failed":"Unable to delete group. If this is an automatic group, it cannot be destroyed.","delete_member_confirm":"Odstranit '%{username}' ze '%{group}' skupiny?","name":"Jméno","add":"Přidat","add_members":"Přidat členy","custom":"Přizpůsobené","automatic":"Automatické","automatic_membership_email_domains":"Uživatelé zaregistrovaní s emailem jehož doména se přesně shoduje s jednou z tohoto seznamu budou automaticky přidáni to této skupiny:","automatic_membership_retroactive":"Aplikovat stejné doménové pravidlo na už existující uživatele","default_title":"Výchozí popis pro všechny uživatele této skupiny","primary_group":"Automaticky nastavit jako hlavní skupinu"},"api":{"generate_master":"Vygenerovat Master API Key","none":"Nejsou tu žádné aktivní API klíče.","user":"Uživatel","title":"API","key":"API klíč","generate":"Vygenerovat API klíč","regenerate":"Znovu-vygenerovat API klíč","revoke":"zrušit","confirm_regen":"Určitě chcete nahradit tenhle API klíč novým?","confirm_revoke":"Jste si jisti, že chcete tento klíč zrušit?","info_html":"Váš API klíč umožní vytvářet a aktualizovat témata pomocí JSONových volání.","all_users":"Všichni uživatelé","note_html":"Uchovejte tento klíč \u003cstrong\u003ev bezpečí\u003c/strong\u003e, každý, kdo má tento klíč, může libovolně vytvářet příspěvky na fóru i za ostatní uživatele."},"plugins":{"title":"Pluginy","installed":"Nainstalované pluginy","name":"Název","none_installed":"Nemáte nainstalované žádné pluginy.","version":"Verze","enabled":"Zapnutý?","is_enabled":"A","not_enabled":"N","change_settings":"Změnit nastavení","change_settings_short":"Nastavení","howto":"Jak nainstaluji pluginy?"},"backups":{"title":"Zálohy","menu":{"backups":"Zálohy","logs":"Logy"},"none":"Žádné zálohy nejsou k dispozici.","read_only":{"enable":{"title":"Zapnout režim jen pro čtení","label":"Zapnout režim jen pro čtení","confirm":"Určitě chcete zapnout režim jen pro čtení?"},"disable":{"title":"Vypnout režim jen pro čtení","label":"Vypnout režim jen pro čtení"}},"logs":{"none":"Zatím je log prázdný..."},"columns":{"filename":"Název souboru","size":"Velikost"},"upload":{"label":"Nahrát","title":"Nahrát zálohu do téhle instance","uploading":"Nahrávání...","success":"'{{filename}}' has successfully been uploaded.","error":"There has been an error while uploading '{{filename}}': {{message}}"},"operations":{"is_running":"An operation is currently running...","failed":"The {{operation}} failed. Please check the logs.","cancel":{"label":"Zrušit","title":"Cancel the current operation","confirm":"Are you sure you want to cancel the current operation?"},"backup":{"label":"Záloha","title":"Vytvořit zálohu","confirm":"Chcete začít novou zálohu?","without_uploads":"Ano (nepřikládej soubory)"},"download":{"label":"Stáhnout","title":"Stáhnout zálohu"},"destroy":{"title":"Odstranit zálohu","confirm":"Are you sure you want to destroy this backup?"},"restore":{"is_disabled":"Restore is disabled in the site settings.","label":"Obnovit","title":"Restore the backup","confirm":"Are your sure you want to restore this backup?"},"rollback":{"label":"Rollback","title":"Rollback the database to previous working state","confirm":"Are your sure you want to rollback the database to the previous working state?"}}},"export_csv":{"user_archive_confirm":"Jste si jistí, že chcete stáhnout všechny své příspěvky?","success":"Export byl spuštěn. O dokončení celého procesu budete informování pomocí zprávy.","failed":"Exportování selhalo. Prosím zkontrolujte logy.","rate_limit_error":"Příspěvky mohou být staženy jednou za den. Prosíme, zkuste to znovu zítra.","button_text":"Export","button_title":{"user":"Exportovat kompletní seznam uživatelů v CSV formátu.","staff_action":"Exportovat kompletní akce redakce v CSV formátu.","screened_email":"Exportovat kompletní seznam emailů v CSV formátu.","screened_ip":"Exportovat kompletní seznam IP adres v CSV formátu.","screened_url":"Exportovat kompletní seznam URL v CSV formátu."}},"export_json":{"button_text":"Export"},"invite":{"button_text":"Poslat pozvánky","button_title":"Poslat pozvánky"},"customize":{"title":"Přizpůsobení","long_title":"Přizpůsobení webu","css":"CSS","header":"header","top":"Vršek","footer":"Patička","head_tag":{"text":"\u003c/head\u003e","title":"HTML které bude vloženo před \u003c/head\u003e HTML tag"},"body_tag":{"text":"\u003c/body\u003e","title":"HTML které bude vloženo před \u003c/body\u003e HTML tag"},"override_default":"Přetížit výchozí?","enabled":"Zapnuto?","preview":"náhled","undo_preview":"odstranit náhled","rescue_preview":"výchozí styl","explain_preview":"Náhled stránky s vlastním stylesheetem.","explain_undo_preview":"Vrátit se k aktuálnímu použitému vlastnímu stylesheetu.","explain_rescue_preview":"Zobrazit web s výchozím stylesheetem.","save":"Uložit","new":"Nové","new_style":"Nový styl","import":"Import","import_title":"Vyberte soubor nebo vložte text","delete":"Smazat","delete_confirm":"Smazat toto přizpůsobení?","color":"Barva","opacity":"Neprůhlednost","copy":"Kopírovat","css_html":{"title":"CSS/HTML","long_title":"Přizpůsobení CSS a HTML"},"colors":{"title":"Barvy","long_title":"Barevná schémata","new_name":"Nové barevné schéma","copy_name_prefix":"Kopie","delete_confirm":"Chcete smazat toto barevné schéma?","undo":"zpět","revert":"vrátit","revert_title":"Vrátit tuto barvu na výchozí barevné schéma Discourse.","primary":{"name":"primární","description":"Většina textu, ikon a okrajů."},"secondary":{"name":"sekundární","description":"Hlavní barva pozadí, a barva textu některých tlačítek."},"tertiary":{"name":"terciární","description":"Odkazy, některá tlačítka, notifikace, a barvy zdůraznění"},"quaternary":{"name":"kvarciální","description":"Navigační odkazy."},"header_background":{"name":"pozadí hlavičky","description":"Barva pozadí záhlaví stránky."},"header_primary":{"name":"primární záhlaví"},"highlight":{"name":"zvýraznit"},"danger":{"name":"nebezpečí"},"success":{"name":"úspěch","description":"Používá se pro indikaci úspěšné akce."},"love":{"name":"láska","description":"Barva tlačítka Like."},"wiki":{"name":"wiki","description":"Základní barva použita pro pozadí wiki článků."}}},"email":{"title":"Email","settings":"Nastavení","all":"Všechny emaily","sending_test":"Zkušební email se odesílá...","error":"\u003cb\u003eCHYBA\u003c/b\u003e - %{server_error}","sent":"Odeslané","skipped":"Přeskočené","sent_at":"Odesláno","time":"Čas","user":"Uživatel","email_type":"Typ emailu","to_address":"Komu","test_email_address":"testovací emailová adresa","send_test":"Odešli testovací email","sent_test":"odesláno!","delivery_method":"Způsob doručení","preview_digest":"Náhled souhrnu","refresh":"Aktualizovat","format":"Formát","html":"html","text":"text","last_seen_user":"Uživatel byl naposled přítomen:","reply_key":"Klíč pro odpověď","skipped_reason":"Důvod přeskočení","logs":{"none":"Žádné záznamy nalezeny.","filters":{"title":"Filtr","user_placeholder":"uživatelské jméno","address_placeholder":"jmeno@priklad.cz","type_placeholder":"souhrn, registrace...","reply_key_placeholder":"klíč pro odpověď","skipped_reason_placeholder":"důvod"}}},"logs":{"title":"Logy a filtry","action":"Akce","created_at":"Zaznamenáno","last_match_at":"Poslední zázn.","match_count":"Záznamů","ip_address":"IP","topic_id":"ID tématu","post_id":"ID příspěvku","delete":"Smazat","edit":"Upravit","save":"Uložit","screened_actions":{"block":"blokovat","do_nothing":"nedělat nic"},"staff_actions":{"title":"Akce moderátorů","instructions":"Pro filtrování seznamu klikejte na uživatele a akce. Kliknutí na avatar otevře profil uživatele.","clear_filters":"Zobrazit vše","staff_user":"Moderátor","target_user":"Cílový uživatel","subject":"Předmět","when":"Kdy","context":"Kontext","details":"Podrobnosti","previous_value":"Předchozí","new_value":"Nové","diff":"Rozdíly","show":"Zobrazit","modal_title":"Podrobnosti","no_previous":"Předchozí hodnota neexistuje.","deleted":"Žádná nová hodnota. Záznam byl odstraněn.","actions":{"delete_user":"odstranit uživatele","change_trust_level":"z. důvěryhodnosti","change_username":"Změnit uživatelské jméno","change_site_setting":"změna nastavení","change_site_customization":"změna přizpůsobení","delete_site_customization":"odstranit přizpůsobení","suspend_user":"suspendovat uživatele","unsuspend_user":"zrušit suspendování","grant_badge":"udělit odznak","revoke_badge":"vzít odznak","check_email":"zkontrolujte email","delete_topic":"smazat téma","delete_post":"smazat příspěvek","impersonate":"vydávat se za uživatele","anonymize_user":"anonymní uživatel"}},"screened_emails":{"title":"Filtrované emaily","description":"Při registraci nového účtu budou konzultovány následujíci adresy. Při shodě bude registrace zablokována, nebo bude provedena jiná akce.","email":"Email Address","actions":{"allow":"Povolit"}},"screened_urls":{"title":"Filtrované URL","description":"URL adresy v tomto seznamu byli použity v příspěvcích od spammerů.","url":"URL","domain":"Doména"},"screened_ips":{"title":"Filtrované IP","description":"Sledované IP adresy. Zvolte „Povolit“ pro přidání IP adresy do whitelistu.","delete_confirm":"Are you sure you want to remove the rule for %{ip_address}?","actions":{"block":"Zablokovat","do_nothing":"Povolit","allow_admin":"Povolit administraci"},"form":{"label":"Nové:","ip_address":"IP adresa","add":"Přidat","filter":"Vyhledat"}},"logster":{"title":"Chybové záznamy"}},"impersonate":{"title":"Přihlásit se jako","not_found":"Tento uživatel nebyl nalezen."},"users":{"title":"Uživatelé","create":"Přidat administrátora","last_emailed":"Email naposledy zaslán","not_found":"Bohužel uživatel s tímto jménem není v našem systému.","id_not_found":"Bohužel uživatel s tímto id není v našem systému.","active":"Aktivní","show_emails":"Ukázat emailové adresy","nav":{"new":"Noví","active":"Aktivní","pending":"Čeká na schválení","staff":"Štáb","suspended":"Zakázaní","blocked":"Blokovaní","suspect":"Podezřelí"},"approved":"Schválen?","approved_selected":{"one":"schválit uživatele","few":"schválit uživatele ({{count}})","other":"schválit uživatele ({{count}})"},"reject_selected":{"one":"reject user","few":"reject users ({{count}})","other":"reject users ({{count}})"},"titles":{"active":"Aktivní uživatelé","new":"Noví uživatelé","pending":"Uživatelé čekající na schválení","newuser":"Uživatelé s věrohodností 0 (Nový uživatel)","basic":"Uživatelé s věrohodností 1 (Základní uživatel)","staff":"Štáb","admins":"Admininstrátoři","moderators":"Moderátoři","blocked":"Blokovaní uživatelé","suspended":"Zakázaní uživatelé","suspect":"Podezřelí uživatelé"},"reject_successful":{"one":"Successfully rejected 1 user.","few":"Successfully rejected %{count} users.","other":"Successfully rejected %{count} users."},"reject_failures":{"one":"Failed to reject 1 user.","few":"Failed to reject %{count} users.","other":"Failed to reject %{count} users."},"not_verified":"Neověřeno","check_email":{"title":"Odhal emailovou adresu tohoto uživatele","text":"Zobrazit"}},"user":{"suspend_failed":"Nastala chyba při zakazování uživatele {{error}}","unsuspend_failed":"Nastala chyba při povolování uživatele {{error}}","suspend_duration":"Jak dlouho má zákaz platit? (dny)","suspend_duration_units":"(days)","suspend_reason_label":"Why are you suspending? This text \u003cb\u003ewill be visible to everyone\u003c/b\u003e on this user's profile page, and will be shown to the user when they try to log in. Keep it short.","suspend_reason":"Reason","suspended_by":"Suspended by","delete_all_posts":"Smazat všechny příspěvky","delete_all_posts_confirm":"You are about to delete %{posts} posts and %{topics} topics. Are you sure?","suspend":"Zakázat","unsuspend":"Povolit","suspended":"Zakázán?","moderator":"Moderátor?","admin":"Administrátor?","blocked":"Zablokovaný?","show_admin_profile":"Administrace","edit_title":"Upravit titul","save_title":"Uložit nadpis","refresh_browsers":"Vynutit obnovení prohlížeče","refresh_browsers_message":"Zpráva odeslána všem klientům!","show_public_profile":"Zobrazit veřejný profil","impersonate":"Vydávat se za uživatele","ip_lookup":"Vyhledávání IP adresy","log_out":"Odhlásit se","logged_out":"Uživatel byl odhlášen na všech zařízeních.","revoke_admin":"Odebrat administrátorská práva","grant_admin":"Udělit administrátorská práva","revoke_moderation":"Odebrat moderátorská práva","grant_moderation":"Udělit moderátorská práva","unblock":"Odblokovat","block":"Zablokovat","reputation":"Reputace","permissions":"Oprávnění","activity":"Aktivita","like_count":"Rozdaných / obdržených 'líbí se'","last_100_days":"Za posledních 100 dní","private_topics_count":"Počet soukromách témat","posts_read_count":"Přečteno příspěvků","post_count":"Vytvořeno příspěvků","topics_entered":"Témat zobrazeno","flags_given_count":"Uděleno nahlášení","flags_received_count":"Přijato nahlášení","warnings_received_count":"Obdržené varování","flags_given_received_count":"Rozdaná / obdržená nahlášení","approve":"Schválit","approved_by":"schválil","approve_success":"Uživatel bys schválen a byl mu zaslán aktivační email s instrukcemi.","approve_bulk_success":"Povedlo se! Všichni uživatelé byli schváleni a byly jim rozeslány notifikace.","time_read":"Čas strávený čtením","anonymize":"Anonymní uživatel","anonymize_confirm":"Jsi si JISTÝ, že chceš udělat tento účet anonymním? Změní se uživatelské jméno a email a vymažou se všechny informace v profilu.","anonymize_yes":"Ano, udělejte tento účet anonymním","anonymize_failed":"Nastal problém při anonymizování účtu.","delete":"Smazat uživatele","delete_forbidden_because_staff":"Správci ani moderátoři nemůžou být odstraněni.","delete_posts_forbidden_because_staff":"Nemohu smazat všechny příspěvky administrátorů a moderátorů.","delete_forbidden":{"one":"Uživatelé nemůžou být smazáni pokud mají příspěvky. Před smazáním uživatele smažte všechny jeho příspěvky. (Příspěvky starší než den nemůžou být smazány.)","few":"Uživatelé nemůžou být smazáni pokud mají příspěvky. Před smazáním uživatele smažte všechny jeho příspěvky. (Příspěvky starší než %{count} dny nemůžou být smazány.)","other":"Uživatelé nemůžou být smazáni pokud mají příspěvky. Před smazáním uživatele smažte všechny jeho příspěvky. (Příspěvky starší než %{count} dnů nemůžou být smazány.)"},"cant_delete_all_posts":{"one":"Všechny příspěvky nelze smazat. Některé příspěvky jsou starší než %{count} den. (Nastavení delete_user_max_post_age.)","few":"Všechny příspěvky nelze smazat. Některé příspěvky jsou starší než %{count} dny. (Nastavení delete_user_max_post_age.)","other":"Všechny příspěvky nelze smazat. Některé příspěvky jsou starší než %{count} dní. (Nastavení delete_user_max_post_age.)"},"cant_delete_all_too_many_posts":{"one":"Nelze smazat všechny příspěvky, protože uživatel má více než 1 příspěvek. (delete_all_posts_max)","few":"Nelze smazat všechny příspěvky, protože uživatel má více než %{count} příspěvky. (delete_all_posts_max)","other":"Nelze smazat všechny příspěvky, protože uživatel má více než %{count} příspěvků. (delete_all_posts_max)"},"delete_confirm":"Jste si jistí, že chcete smazat tohoto uživatele? Tato akce je nevratná!","delete_and_block":"Smaž a \u003cb\u003eblokuj\u003c/b\u003e tento email a IP adresu.","delete_dont_block":"Pouze smazat","deleted":"Uživatel byl smazán.","delete_failed":"Nastala chyba při odstraňování uživatele. Ujistěte se, že jsou všechny příspěvky tohoto uživatele smazané, než budete uživatele mazat.","send_activation_email":"Odeslat aktivační email","activation_email_sent":"Aktivační email byl odeslán.","send_activation_email_failed":"Nastal problém při odesílání aktivačního emailu.","activate":"Aktivovat účet","activate_failed":"Nasstal problém při aktivování tohoto uživatele.","deactivate_account":"Deaktivovat účet","deactivate_failed":"Nastal problém při deaktivování tohoto uživatele.","unblock_failed":"Nastal problém při odblokování uživatele.","block_failed":"Nastal problém při blokování uživatele.","deactivate_explanation":"Uživatel bude muset znovu potvrdit emailovou adresu.","suspended_explanation":"Zakázaný uživatel se nemůže přihlásit.","block_explanation":"Zablokovaný uživatel nemůže přispívat nebo vytvářet nová témata.","trust_level_change_failed":"Nastal problém při změně důveryhodnosti uživatele.","suspend_modal_title":"Suspend User","trust_level_2_users":"Uživatelé důvěryhodnosti 2","trust_level_3_requirements":"Požadavky pro důvěryhodnost 3","trust_level_locked_tip":"úroveň důvěryhodnosti uzamčena. Systém nebude povyšovat ani degradovat uživatele","trust_level_unlocked_tip":"úroveň důvěryhodnosti odemčena. Systém může povyšovat nebo degradovat uživatele","lock_trust_level":"Zamknout úroveň důvěryhodnosti","unlock_trust_level":"Odemknout úroveň důvěryhodnosti","tl3_requirements":{"title":"Požadavky pro důvěryhodnost 3","table_title":"Za posledních 100 dní:","value_heading":"Hodnota","requirement_heading":"Požadavek","visits":"Návštěv","days":"dní","topics_replied_to":"Odpovědí na témata","topics_viewed":"Zobrazeno témat","topics_viewed_all_time":"Zobrazeno témat (od počátku věků)","posts_read":"Přečteno příspěvků","posts_read_all_time":"Přečteno příspěvků (od počátku věků)","flagged_posts":"Nahlášené příspěvky","flagged_by_users":"Users Who Flagged","likes_given":"Rozdaných 'líbí se'","likes_received":"Obdržených 'líbí se'","likes_received_days":"Obdržených 'líbí se': unikátní dny","likes_received_users":"Obdržených 'líbí se': unikátní uživatelé","qualifies":"Splňuje úroveň důvěryhodnosti 3.","does_not_qualify":"Nesplňuje úroveň důvěryhodnosti 3.","will_be_promoted":"Bude brzy povýšen.","will_be_demoted":"Bude brzy degradován.","on_grace_period":"Currently in promotion grace period, will not be demoted.","locked_will_not_be_promoted":"Úroveň důvěryhodnosti uzamčena. Nikdy nebude povýšen.","locked_will_not_be_demoted":"Úroveň důvěryhodnosti uzamčena. Nikdy nebude degradován."},"sso":{"title":"Jednorázové přihlášení","external_id":"Externí ID","external_username":"Uživatelské jméno","external_name":"Jméno","external_email":"Email","external_avatar_url":"URL na profilový obrázek"}},"user_fields":{"title":"User Fields","help":"Přidej fields, které tvoji uživatelé mohou vyplnit.","create":"Vytvořit rozšíření","untitled":"Untitled","name":"Field Name","type":"Field Type","description":"Field Description","save":"Uložit","edit":"Upravit","delete":"Smazat","cancel":"Zrušit","delete_confirm":"Určitě chcete smazat toto rozšíření?","required":{"title":"Povinné pro registraci?","enabled":"povinné","disabled":"není povinné"},"editable":{"title":"Editovatelné po registraci?","enabled":"editovatelné","disabled":"není editovatelné"},"show_on_profile":{"title":"Zveřejnit na uživatelském profilu?","enabled":"zveřejněno na profilu","disabled":"nezveřejněno na profilu"},"field_types":{"text":"Text Field","confirm":"Potvrzení"}},"site_text":{"none":"Vyberte obsah který chcete upravit.","title":"Texty"},"site_settings":{"show_overriden":"Zobrazit pouze změněná nastavení","title":"Nastavení","reset":"obnovit výchozí","none":"žádné","no_results":"Nenalezeny žádné výsledky.","clear_filter":"Zrušit","add_url":"přidat URL","categories":{"all_results":"Všechny","required":"Nezbytnosti","basic":"Základní nastavení","users":"Uživatelé","posting":"Přispívání","email":"Emaily","files":"Soubory","trust":"Důvěryhodnosti","security":"Bezpečnost","onebox":"Onebox","seo":"SEO","spam":"Spam","rate_limits":"Limity a omezení","developer":"Vývojáři","embedding":"Embedding","legal":"Právní záležitosti","uncategorized":"Ostatní","backups":"Zálohy","login":"Login","plugins":"Pluginy"}},"badges":{"title":"Odznaky","new_badge":"Nový odznak","new":"Nové","name":"Jméno","badge":"Odznak","display_name":"Zobrazované jméno","description":"Popis","badge_type":"Typ odznaku","badge_grouping":"Skupina","granted_by":"Uděleno","granted_at":"Uděleno v","reason_help":"(Odkaz na příspěvek nebo téma)","save":"Uložit","delete":"Smazat","delete_confirm":"Určitě chcete tento oznak smazat?","revoke":"zrušit","reason":"Důvod","expand":"Rozevřít \u0026hellip;","revoke_confirm":"Určitě chcete tento odznak odejmout?","edit_badges":"Upravit odznaky","grant_badge":"Udělit odznak","granted_badges":"Udělené odznaky","grant":"Udělit","no_user_badges":"%{name} nezískal žádné oznaky.","no_badges":"Nejsou tu žádné odznaky, které by se dali rozdat.","none_selected":"Vyberte odznak, abyste mohli začít","allow_title":"Povolit užití odzanku jako titul","multiple_grant":"Může být přiděleno několikrát","listable":"Zobrazit odznak na veřejné stránce s odzanky","enabled":"Povolit odznaky","icon":"Ikona","image":"Obrázek","icon_help":"Použijte buď Font Awesome nebo URL k obrázku.","query":"Dotaz na odznak (SQL)","trigger":"Spouštěč","trigger_type":{"none":"Aktualizujte denně","post_action":"Když uživatel reaguje na příspěvek","post_revision":"Když uživatel upraví nebo vytvoří příspěvek","trust_level_change":"Když uživatel změní důvěryhodnost","user_change":"Když je uživatel upraven nebo vytvořen"},"preview":{"sql_error_header":"Bohužel, nastala chyba s dotazem.","error_help":"Prohlédněte si následující odkazy, které vám zodpoví dotazy o odznacích.","bad_count_warning":{"header":"VAROVÁNÍ!"},"sample":"Příklad:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link}","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e for post in %{link} at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e at \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Vložte nové emoji, které bude dostupné pro všechny na fóru. (Protip: můžete přetáhnout několik souborů najednou.)","add":"Vložit nový Emoji","name":"Název","image":"Obrázek","delete_confirm":"Určitě chcete smazat :%{name}: emoji?"}},"lightbox":{"download":"download"},"search_help":{"title":"Vyhledat v nápovědě"},"keyboard_shortcuts_help":{"title":"Klávesové zkratky","jump_to":{"title":"Jump To","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Domů","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e Poslední","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Nový","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Nepřečtěné","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategorie","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Nahoru","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e Záložky"},"navigation":{"title":"Navigation","jump":"\u003cb\u003e#\u003c/b\u003e Jdi na příspěvek #","back":"\u003cb\u003eu\u003c/b\u003e Back","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e Move selection \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e Open selected topic","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Následující/předchozí výběr"},"application":{"title":"Application","create":"\u003cb\u003ec\u003c/b\u003e Create a new topic","notifications":"\u003cb\u003en\u003c/b\u003e Open notifications","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Otevře uživatelské menu","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Ukáže aktualizovaná témata","search":"\u003cb\u003e/\u003c/b\u003e Search","help":"\u003cb\u003e?\u003c/b\u003e Otevře seznam klávesových zkratek","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Dismiss New/Posts","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Dismiss Topics"},"actions":{"title":"Actions","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Toggle bookmark topic","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Připnout/Odepnout téma","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Sdílet téma","share_post":"\u003cb\u003es\u003c/b\u003e Share post","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Odpovědět v propojeném tématu","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Odpovědět na téma","reply_post":"\u003cb\u003er\u003c/b\u003e Odpovědět na příspěvek","quote_post":"\u003cb\u003eq\u003c/b\u003e Citovat příspěvek","like":"\u003cb\u003el\u003c/b\u003e Like post","flag":"\u003cb\u003e!\u003c/b\u003e Flag post","bookmark":"\u003cb\u003eb\u003c/b\u003e Bookmark post","edit":"\u003cb\u003ee\u003c/b\u003e Edit post","delete":"\u003cb\u003ed\u003c/b\u003e Delete post","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Mute topic","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Regular (default) topic","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Track topic","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Watch topic"}},"badges":{"title":"Odznaky","allow_title":"může být použito jako titul","multiple_grant":"může být přiděleno několikrát","badge_count":{"one":"1 odznak","few":"%{count} odznaky","other":"%{count} odznaků"},"more_badges":{"one":"+1 další","few":"+%{count} další","other":"+%{count} dalších"},"granted":{"one":"1 udělen","few":"1 udělen","other":"%{count} uděleno"},"select_badge_for_title":"Vyberte odznak, který chcete použít jako svůj titul","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Jak začít?"},"community":{"name":"Komunita"},"trust_level":{"name":"Věrohodnost"},"other":{"name":"Ostatní"},"posting":{"name":"Přispívání"}},"badge":{"editor":{"name":"Editor","description":"První úprava příspěvku."},"basic_user":{"name":"Základní","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003eGranted\u003c/a\u003e all essential community functions"},"member":{"name":"Člen","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003ePovoleny\u003c/a\u003e pozvánky"},"regular":{"name":"Normální"},"leader":{"name":"Vůdce","description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003ePovoleno\u003c/a\u003e globální editování, připínání, zavírání, archivace, rozdělení a spojení"},"welcome":{"name":"Vítejte","description":"Obdrženo líbí se mi"},"autobiographer":{"name":"Autor vlastního životopisu","description":"Vypněné informace v \u003ca href=\"/my/preferences\"\u003eprofilu\u003c/a\u003e."},"anniversary":{"name":"Výročí","description":"Aktivním členem přes rok, přispěl alespoň jednou"},"nice_post":{"name":"Zdařilý příspěvek","description":"Obdrženo 10 líbí se na příspěvku. Tento odznak můžete získat opakovaně"},"good_post":{"name":"Dobrý příspěvek","description":"Obdrženo 25 líbí se na příspěvku. Tento odznak můžete získat opakovaně"},"great_post":{"name":"Výborný příspěvek","description":"Obdrženo 50 líbí se na příspěvku. Tento odznak můžete získat opakovaně"},"nice_topic":{"name":"Zdařilé téma","description":"Obdrženo 10 líbí se v tématu. Tento odznak můžete získat opakovaně"},"good_topic":{"name":"Dobré téma","description":"Obdrženo 25 líbí se v tématu. Tento odznak můžete získat opakovaně"},"great_topic":{"name":"Výborné téma","description":"Obdrženo 50 líbí se v tématu. Tento odznak můžete získat opakovaně"},"nice_share":{"name":"Zdařilé sdílení","description":"Sdílení příspěvku s 25 unikátními návštěvníky"},"good_share":{"name":"Dobré sdílení","description":"Sdílení příspěvku s 300 unikátními návštěvníky"},"great_share":{"name":"Výborné sdílení","description":"Sdílení příspěvku s 1000 unikátními návštěvníky"},"first_like":{"name":"První lajk","description":"Líbil se příspěvek"},"first_flag":{"name":"První nahlášení","description":"Nahlášen příspěvek"},"first_share":{"name":"První sdílení","description":"Sdílený příspěvek"},"first_link":{"name":"První odkaz","description":"Vložen interní odkaz na jiné téma"},"first_quote":{"name":"První citace","description":"Citovat uživatele"},"read_guidelines":{"name":"Přečíst pokyny","description":"Přečíst \u003ca href=\"/guidelines\"\u003ekomunitní pokyny\u003c/a\u003e"},"reader":{"name":"Čtenář","description":"Přečíst každý příspěvek v tématu s více než 100 příspěvky"}}}}},"en":{"js":{"action_codes":{"split_topic":"split this topic %{when}","autoclosed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"closed":{"enabled":"closed %{when}","disabled":"opened %{when}"},"archived":{"enabled":"archived %{when}","disabled":"unarchived %{when}"},"pinned":{"enabled":"pinned %{when}","disabled":"unpinned %{when}"},"pinned_globally":{"enabled":"pinned globally %{when}","disabled":"unpinned %{when}"},"visible":{"enabled":"listed %{when}","disabled":"unlisted %{when}"}},"show_help":"options","uploading_filename":"Uploading {{filename}}...","switch_from_anon":"Exit Anonymous","groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"add":"Add","selector_placeholder":"Add members","owner":"owner","trust_levels":{"title":"Trust level automatically granted to members when they're added:","none":"None"}},"categories":{"reorder":{"title":"Reorder Categories","title_long":"Reorganize the category list","fix_order":"Fix Positions","fix_order_tooltip":"Not all categories have a unique position number, which may cause unexpected results.","save":"Save Order","apply_all":"Apply","position":"Position"}},"user_fields":{"none":"(select an option)"},"user":{"expand_profile":"Expand","desktop_notifications":{"label":"Desktop Notifications","not_supported":"Notifications are not supported on this browser. Sorry.","perm_default":"Turn On Notifications","perm_denied_btn":"Permission Denied","perm_denied_expl":"You have denied permission for notifications. Use your browser to enable notifications, then click the button when done. (Desktop: The leftmost icon in the address bar. Mobile: 'Site Info'.)","disable":"Disable Notifications","currently_enabled":"(currently enabled)","enable":"Enable Notifications","currently_disabled":"(currently disabled)","each_browser_note":"Note: You have to change this setting on every browser you use."},"blocked_tooltip":"This user is blocked","muted_categories_instructions":"You will not be notified of anything about new topics in these categories, and they will not appear in latest.","muted_topics_link":"Show muted topics","automatically_unpin_topics":"Automatically unpin topics when you reach the bottom.","messages":{"groups":"My Groups"},"change_avatar":{"cache_notice":"You've successfully changed your profile picture but it might take some time to appear due to browser caching."},"email":{"frequency_immediately":"We'll email you immediately if you haven't read the thing we're emailing you about.","frequency":{"one":"We'll only email you if we haven't seen you in the last minute.","other":"We'll only email you if we haven't seen you in the last {{count}} minutes."}},"email_always":"Send me email notifications even when I am active on the site","new_topic_duration":{"after_1_day":"created in the last day","after_2_days":"created in the last 2 days","after_1_week":"created in the last week","after_2_weeks":"created in the last 2 weeks"},"auto_track_options":{"after_30_seconds":"after 30 seconds","after_1_minute":"after 1 minute","after_2_minutes":"after 2 minutes","after_3_minutes":"after 3 minutes","after_4_minutes":"after 4 minutes","after_5_minutes":"after 5 minutes","after_10_minutes":"after 10 minutes"},"invited":{"sent":"Sent","none":"There are no pending invites to display.","truncated":{"one":"Showing the first invite.","other":"Showing the first {{count}} invites."},"redeemed_tab_with_count":"Redeemed ({{count}})","pending_tab_with_count":"Pending ({{count}})","generate_link":"Copy Invite Link","generated_link_message":"\u003cp\u003eInvite link generated successfully!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eInvite link is only valid for this email address: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e"}},"errors":{"reasons":{"not_found":"Page Not Found"},"desc":{"not_found":"Oops, the application tried to load a URL that doesn't exist."}},"too_few_topics_and_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics and \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","too_few_topics_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e topics. New visitors need some conversations to read and respond to.","too_few_posts_notice":"Let's \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003eget this discussion started!\u003c/a\u003e There are currently \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e posts. New visitors need some conversations to read and respond to.","signup_cta":{"sign_up":"Sign Up","hide_session":"Remind me tomorrow","hide_forever":"no thanks","hidden_for_session":"OK, I'll ask you tomorrow. You can always use 'Log In' to create an account, too.","intro":"Hey there! :heart_eyes: Looks like you're enjoying the discussion, but you're not signed up for an account.","value_prop":"When you create an account, we remember exactly what you've read, so you always come right back where you left off. You also get notifications, here and via email, whenever new posts are made. And you can like posts to share the love. :heartbeat:"},"login":{"to_continue":"Please Log In","preferences":"You need to be logged in to change your user preferences.","forgot":"I don't recall my account details"},"shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"more_emoji":"more...","options":"Options","whisper":"whisper","toggle_whisper":"Toggle Whisper","group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","reply_placeholder":"Type here. Use Markdown, BBCode, or HTML to format. Drag or paste images.","saving":"Saving","link_placeholder":"http://example.com \"optional text\"","modal_ok":"OK","modal_cancel":"Cancel","cant_send_pm":"Sorry, you can't send a message to %{username}.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","alt":{"mentioned":"Mentioned by","quoted":"Quoted by","replied":"Replied","posted":"Post by","edited":"Edit your post by","liked":"Liked your post","private_message":"Private message from","invited_to_private_message":"Invited to a private message from","invited_to_topic":"Invited to a topic from","invitee_accepted":"Invite accepted by","moved_post":"Your post was moved by","linked":"Link to your post","granted_badge":"Badge granted"}},"upload_selector":{"remote_tip_with_attachments":"link to image or file {{authorized_extensions}}","local_tip":"select images from your device","local_tip_with_attachments":"select images or files from your device {{authorized_extensions}}","hint_for_supported_browsers":"you can also drag and drop or paste images into the editor"},"search":{"sort_by":"Sort by","relevance":"Relevance","latest_post":"Latest Post","most_viewed":"Most Viewed","most_liked":"Most Liked","select_all":"Select All","clear_all":"Clear All","result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e","other":"{{count}} results for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"},"no_more_results":"No more results found.","search_help":"Search help"},"hamburger_menu":"go to another topic list or category","new_item":"new","topics":{"bulk":{"unlist_topics":"Unlist Topics","dismiss":"Dismiss","dismiss_read":"Dismiss all unread","dismiss_button":"Dismiss…","dismiss_tooltip":"Dismiss just new posts or stop tracking topics","also_dismiss_topics":"Stop tracking these topics so they never show up as unread for me again"}},"topic":{"unsubscribe":{"stop_notifications":"You will now receive less notifications for \u003cstrong\u003e{{title}}\u003c/strong\u003e","change_notification_state":"Your current notification state is "},"read_more_MF":"There { UNREAD, plural, =0 {} one { is \u003ca href='/unread'\u003e1 unread\u003c/a\u003e } other { are \u003ca href='/unread'\u003e# unread\u003c/a\u003e } } { NEW, plural, =0 {} one { {BOTH, select, true{and } false {is } other{}} \u003ca href='/new'\u003e1 new\u003c/a\u003e topic} other { {BOTH, select, true{and } false {are } other{}} \u003ca href='/new'\u003e# new\u003c/a\u003e topics} } remaining, or {CATEGORY, select, true {browse other topics in {catLink}} false {{latestLink}} other {}}","auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","notifications":{"regular":{"title":"Normal"},"regular_pm":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about this topic, and it will not appear in latest."}},"feature_topic":{"pin":"Make this topic appear at the top of the {{categoryLink}} category until","unpin_until":"Remove this topic from the top of the {{categoryLink}} category or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_validation":"A date is required to pin this topic.","not_pinned":"There are no topics pinned in {{categoryLink}}.","already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"pin_globally":"Make this topic appear at the top of all topic lists until","unpin_globally_until":"Remove this topic from the top of all topic lists or wait until \u003cstrong\u003e%{until}\u003c/strong\u003e.","not_pinned_globally":"There are no topics pinned globally.","already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e","other":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e"},"no_banner_exists":"There is no banner topic.","banner_exists":"There \u003cstrong class='badge badge-notification unread'\u003eis\u003c/strong\u003e currently a banner topic."},"controls":"Topic Controls","change_timestamp":{"title":"Change Timestamp","action":"change timestamp","invalid_timestamp":"Timestamp cannot be in the future.","error":"There was an error changing the timestamp of the topic.","instructions":"Please select the new timestamp of the topic. Posts in the topic will be updated to have the same time difference."}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","has_likes_title_only_you":"you liked this post","has_likes_title_you":{"one":"you and 1 other person liked this post","other":"you and {{count}} other people liked this post"},"whisper":"this post is a private whisper for moderators","controls":{"change_owner":"Change Ownership"}},"category":{"create_long":"Create a new category","special_warning":"Warning: This category is a pre-seeded category and the security settings cannot be edited. If you do not wish to use this category, delete it instead of repurposing it.","contains_messages":"Change this category to only contain messages.","suppress_from_homepage":"Suppress this category from the homepage.","notifications":{"watching":{"description":"You will automatically watch all new topics in these categories. You will be notified of every new post in every topic, and a count of new replies will be shown."},"tracking":{"description":"You will automatically track all new topics in these categories. You will be notified if someone mentions your @name or replies to you, and a count of new replies will be shown."},"regular":{"title":"Normal"},"muted":{"description":"You will never be notified of anything about new topics in these categories, and they will not appear in latest."}}},"flagging":{"take_action_tooltip":"Reach the flag threshold immediately, rather than waiting for more community flags","notify_staff":"Notify Staff"},"topic_statuses":{"locked_and_archived":{"help":"This topic is closed and archived; it no longer accepts new replies and cannot be changed"},"pinned_globally":{"help":"This topic is pinned globally; it will display at the top of latest and its category"}},"filters":{"latest":{"title":"Latest","title_with_count":{"one":"Latest (1)","other":"Latest ({{count}})"}},"unread":{"title":"Unread","title_with_count":{"one":"Unread (1)","other":"Unread ({{count}})"},"lower_title_with_count":{"one":"1 unread","other":"{{count}} unread"}},"new":{"lower_title_with_count":{"one":"1 new","other":"{{count}} new"},"title":"New","title_with_count":{"one":"New (1)","other":"New ({{count}})"}},"category":{"title":"{{categoryName}}","title_with_count":{"one":"{{categoryName}} (1)","other":"{{categoryName}} ({{count}})"}},"top":{"quarterly":{"title":"Quarterly"},"this_quarter":"Quarter"}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose at least \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You may choose up to \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option.","other":"You must choose \u003cstrong\u003e%{count}\u003c/strong\u003e options."},"between_min_and_max_options":"You may choose between \u003cstrong\u003e%{min}\u003c/strong\u003e and \u003cstrong\u003e%{max}\u003c/strong\u003e options."}},"error_while_toggling_status":"There was an error while toggling the status of this poll."},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"groups":{"delete_owner_confirm":"Remove owner privilege for '%{username}'?","bulk_complete":"The users have been added to the group.","bulk":"Bulk Add to Group","bulk_paste":"Paste a list of usernames or emails, one per line:","bulk_select":"(select a group)","group_owners":"Owners","add_owners":"Add owners","incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"embedded_css":"Embedded CSS","about":"Modify CSS stylesheets and HTML headers on the site. Add a customization to start.","email_templates":{"title":"Email Templates","subject":"Subject","multiple_subjects":"This email template has multiple subjects.","body":"Body","none_selected":"Select an email template to begin editing.","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?"},"colors":{"about":"Modify the colors used on the site without writing CSS. Add a scheme to start.","undo_title":"Undo your changes to this color since the last time it was saved.","header_primary":{"description":"Text and icons in the site's header."},"highlight":{"description":"The background color of highlighted elements on the page, such as posts and topics."},"danger":{"description":"Highlight color for actions like deleting posts and topics."}}},"email":{"test_error":"There was a problem sending the test email. Please double-check your mail settings, verify that your host is not blocking mail connections, and try again.","preview_digest_desc":"Preview the content of the digest emails sent to inactive users."},"logs":{"category_id":"Category ID","staff_actions":{"actions":{"roll_up":"roll up IP blocks","change_category_settings":"change category settings","delete_category":"delete category","create_category":"create category"}},"screened_ips":{"roll_up_confirm":"Are you sure you want to roll up commonly screened IP addresses into subnets?","rolled_up_some_subnets":"Successfully rolled up IP ban entries to these subnets: %{subnets}.","rolled_up_no_subnet":"There was nothing to roll up.","roll_up":{"text":"Roll up","title":"Creates new subnet ban entries if there are at least 'min_ban_entries_for_roll_up' entries."}}},"impersonate":{"help":"Use this tool to impersonate a user account for debugging purposes. You will have to log out once finished.","invalid":"Sorry, you may not impersonate that user."},"users":{"titles":{"member":"Users at Trust Level 2 (Member)","regular":"Users at Trust Level 3 (Regular)","leader":"Users at Trust Level 4 (Leader)"}},"user_fields":{"options":"Options","field_types":{"dropdown":"Dropdown"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"site_settings":{"add_host":"add host","categories":{"user_preferences":"User Preferences"}},"badges":{"badge_groupings":{"modal_title":"Badge Groupings"},"target_posts":"Query targets posts","auto_revoke":"Run revocation query daily","show_posts":"Show post granting badge on badge page","preview":{"link_text":"Preview granted badges","plan_text":"Preview with query plan","modal_title":"Badge Query Preview","bad_count_warning":{"text":"There are missing grant samples. This happens when the badge query returns user IDs or post IDs that do not exist. This may cause unexpected results later on - please double-check your query."},"no_grant_count":"No badges to be assigned.","grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned.","other":"\u003cb\u003e%{count}\u003c/b\u003e badges to be assigned."}}},"embedding":{"get_started":"If you'd like to embed Discourse on another website, begin by adding its host.","confirm_delete":"Are you sure you want to delete that host?","sample":"Use the following HTML code into your site to create and embed discourse topics. Replace \u003cb\u003eREPLACE_ME\u003c/b\u003e with the canonical URL of the page you are embedding it on.","title":"Embedding","host":"Allowed Hosts","edit":"edit","category":"Post to Category","add_host":"Add Host","settings":"Embedding Settings","feed_settings":"Feed Settings","feed_description":"Providing an RSS/ATOM feed for your site can improve Discourse's ability to import your content.","crawling_settings":"Crawler Settings","crawling_description":"When Discourse creates topics for your posts, if no RSS/ATOM feed is present it will attempt to parse your content out of your HTML. Sometimes it can be challenging to extract your content, so we provide the ability to specify CSS rules to make extraction easier.","embed_by_username":"Username for topic creation","embed_post_limit":"Maximum number of posts to embed","embed_username_key_from_feed":"Key to pull discourse username from feed","embed_truncate":"Truncate the embedded posts","embed_whitelist_selector":"CSS selector for elements that are allowed in embeds","embed_blacklist_selector":"CSS selector for elements that are removed from embeds","feed_polling_enabled":"Import posts via RSS/ATOM","feed_polling_url":"URL of RSS/ATOM feed to crawl","save":"Save Embedding Settings"},"permalink":{"title":"Permalinks","url":"URL","topic_id":"Topic ID","topic_title":"Topic","post_id":"Post ID","post_title":"Post","category_id":"Category ID","category_title":"Category","external_url":"External URL","delete_confirm":"Are you sure you want to delete this permalink?","form":{"label":"New:","add":"Add","filter":"Search (URL or External URL)"}}},"keyboard_shortcuts_help":{"jump_to":{"profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profile","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Messages"},"application":{"hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Open hamburger menu","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Log Out"}},"badges":{"badge":{"regular":{"description":"\u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003eGranted\u003c/a\u003e recategorize, rename, followed links and lounge"},"promoter":{"name":"Promoter","description":"Invited a user"},"campaigner":{"name":"Campaigner","description":"Invited 3 basic users (trust level 1)"},"champion":{"name":"Champion","description":"Invited 5 members (trust level 2)"},"popular_link":{"name":"Popular Link","description":"Posted an external link with at least 50 clicks"},"hot_link":{"name":"Hot Link","description":"Posted an external link with at least 300 clicks"},"famous_link":{"name":"Famous Link","description":"Posted an external link with at least 1000 clicks"}}},"google_search":"\u003ch3\u003eSearch with Google\u003c/h3\u003e\n\u003cp\u003e\n  \u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n    \u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n    \u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n    \u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n  \u003c/form\u003e\n\u003c/p\u003e\n"}}};
I18n.locale = 'cs';
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
// locale : czech (cs)
// author : petrbela : https://github.com/petrbela

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['moment'], factory); // AMD
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../moment')); // Node
    } else {
        factory(window.moment); // Browser global
    }
}(function (moment) {
    var months = "leden_únor_březen_duben_květen_červen_červenec_srpen_září_říjen_listopad_prosinec".split("_"),
        monthsShort = "led_úno_bře_dub_kvě_čvn_čvc_srp_zář_říj_lis_pro".split("_");

    function plural(n) {
        return (n > 1) && (n < 5) && (~~(n / 10) !== 1);
    }

    function translate(number, withoutSuffix, key, isFuture) {
        var result = number + " ";
        switch (key) {
        case 's':  // a few seconds / in a few seconds / a few seconds ago
            return (withoutSuffix || isFuture) ? 'pár sekund' : 'pár sekundami';
        case 'm':  // a minute / in a minute / a minute ago
            return withoutSuffix ? 'minuta' : (isFuture ? 'minutu' : 'minutou');
        case 'mm': // 9 minutes / in 9 minutes / 9 minutes ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'minuty' : 'minut');
            } else {
                return result + 'minutami';
            }
            break;
        case 'h':  // an hour / in an hour / an hour ago
            return withoutSuffix ? 'hodina' : (isFuture ? 'hodinu' : 'hodinou');
        case 'hh': // 9 hours / in 9 hours / 9 hours ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'hodiny' : 'hodin');
            } else {
                return result + 'hodinami';
            }
            break;
        case 'd':  // a day / in a day / a day ago
            return (withoutSuffix || isFuture) ? 'den' : 'dnem';
        case 'dd': // 9 days / in 9 days / 9 days ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'dny' : 'dní');
            } else {
                return result + 'dny';
            }
            break;
        case 'M':  // a month / in a month / a month ago
            return (withoutSuffix || isFuture) ? 'měsíc' : 'měsícem';
        case 'MM': // 9 months / in 9 months / 9 months ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'měsíce' : 'měsíců');
            } else {
                return result + 'měsíci';
            }
            break;
        case 'y':  // a year / in a year / a year ago
            return (withoutSuffix || isFuture) ? 'rok' : 'rokem';
        case 'yy': // 9 years / in 9 years / 9 years ago
            if (withoutSuffix || isFuture) {
                return result + (plural(number) ? 'roky' : 'let');
            } else {
                return result + 'lety';
            }
            break;
        }
    }

    return moment.defineLocale('cs', {
        months : months,
        monthsShort : monthsShort,
        monthsParse : (function (months, monthsShort) {
            var i, _monthsParse = [];
            for (i = 0; i < 12; i++) {
                // use custom parser to solve problem with July (červenec)
                _monthsParse[i] = new RegExp('^' + months[i] + '$|^' + monthsShort[i] + '$', 'i');
            }
            return _monthsParse;
        }(months, monthsShort)),
        weekdays : "neděle_pondělí_úterý_středa_čtvrtek_pátek_sobota".split("_"),
        weekdaysShort : "ne_po_út_st_čt_pá_so".split("_"),
        weekdaysMin : "ne_po_út_st_čt_pá_so".split("_"),
        longDateFormat : {
            LT: "H.mm",
            L : "DD. MM. YYYY",
            LL : "D. MMMM YYYY",
            LLL : "D. MMMM YYYY LT",
            LLLL : "dddd D. MMMM YYYY LT"
        },
        calendar : {
            sameDay: "[dnes v] LT",
            nextDay: '[zítra v] LT',
            nextWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[v neděli v] LT';
                case 1:
                case 2:
                    return '[v] dddd [v] LT';
                case 3:
                    return '[ve středu v] LT';
                case 4:
                    return '[ve čtvrtek v] LT';
                case 5:
                    return '[v pátek v] LT';
                case 6:
                    return '[v sobotu v] LT';
                }
            },
            lastDay: '[včera v] LT',
            lastWeek: function () {
                switch (this.day()) {
                case 0:
                    return '[minulou neděli v] LT';
                case 1:
                case 2:
                    return '[minulé] dddd [v] LT';
                case 3:
                    return '[minulou středu v] LT';
                case 4:
                case 5:
                    return '[minulý] dddd [v] LT';
                case 6:
                    return '[minulou sobotu v] LT';
                }
            },
            sameElse: "L"
        },
        relativeTime : {
            future : "za %s",
            past : "před %s",
            s : translate,
            m : translate,
            mm : translate,
            h : translate,
            hh : translate,
            d : translate,
            dd : translate,
            M : translate,
            MM : translate,
            y : translate,
            yy : translate
        },
        ordinal : '%d.',
        week : {
            dow : 1, // Monday is the first day of the week.
            doy : 4  // The week that contains Jan 4th is the first week of the year.
        }
    });
}));

moment.fn.shortDateNoYear = function(){ return this.format('D. MMM'); };
moment.fn.shortDate = function(){ return this.format('D. MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('D. MMMM YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};

I18n.pluralizationRules['cs'] = function (n) {
  if (n == 0) return ["zero", "none", "other"];
  if (n == 1) return "one";
  if (n >= 2 && n <= 4) return "few";
  return "other";
};
