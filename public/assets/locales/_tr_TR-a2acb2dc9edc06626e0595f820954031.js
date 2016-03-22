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
MessageFormat.locale.en = function ( n ) {
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
    })({"topic.read_more_MF" : function(){ return "Invalid Format: Plural Function not found for locale: tr_TR";} , "posts_likes_MF" : function(){ return "Invalid Format: Plural Function not found for locale: tr_TR";}});I18n.translations = {"tr_TR":{"js":{"number":{"format":{"separator":".","delimiter":","},"human":{"storage_units":{"format":"%n %u","units":{"byte":{"other":"Bayt"},"gb":"GB","kb":"KB","mb":"MB","tb":"TB"}}},"short":{"thousands":"{{number}}b","millions":"{{number}}M"}},"dates":{"time":"h:mm a","long_no_year":"D MMM h:mm a","long_no_year_no_time":"D MMM","full_no_year_no_time":"MMMM Do","long_with_year":"D MMM, YYYY h:mm a","long_with_year_no_time":"D MMM, YYYY","full_with_year_no_time":"MMMM Do, YYYY","long_date_with_year":"D MMM, 'YY LT","long_date_without_year":"D MMM, LT","long_date_with_year_without_time":"D MMM, 'YY","long_date_without_year_with_linebreak":"D MMM \u003cbr/\u003eLT","long_date_with_year_with_linebreak":"D MMM, 'YY \u003cbr/\u003eLT","tiny":{"half_a_minute":"\u003c 1d","less_than_x_seconds":{"other":"\u003c %{count}s"},"x_seconds":{"other":"%{count}s"},"less_than_x_minutes":{"other":"\u003c %{count}d"},"x_minutes":{"other":"%{count}d"},"about_x_hours":{"other":"%{count}s"},"x_days":{"other":"%{count}g"},"about_x_years":{"other":"%{count}y"},"over_x_years":{"other":"\u003e %{count}y"},"almost_x_years":{"other":"%{count}y"},"date_month":"D MMM","date_year":"MMM 'YY"},"medium":{"x_minutes":{"other":"%{count} dakika"},"x_hours":{"other":"%{count} saat"},"x_days":{"other":"%{count} gün"},"date_year":"D MMM, 'YY"},"medium_with_ago":{"x_minutes":{"other":"%{count} dakika önce"},"x_hours":{"other":"%{count} saat önce"},"x_days":{"other":"%{count} gün önce"}},"later":{"x_days":{"other":"%{count} gün sonra"},"x_months":{"other":"%{count} ay sonra"},"x_years":{"other":"%{count} yıl sonra"}}},"share":{"topic":"bu konunun bağlantısını paylaşın","post":"#%{postNumber} nolu gönderiyi paylaşın","close":"kapat","twitter":"bu bağlantıyı Twitter'da paylaşın","facebook":"bu bağlantıyı Facebook'da paylaşın","google+":"bu bağlantıyı Google+'da paylaşın","email":"bu bağlantıyı e-posta ile gönderin"},"action_codes":{"split_topic":"bu konuyu ayır %{when}","autoclosed":{"enabled":"%{when} kapatıldı","disabled":"%{when} açıldı"},"closed":{"enabled":"%{when} kapatıldı","disabled":"%{when} açıldı"},"archived":{"enabled":"%{when} arşivlendi","disabled":"%{when} arşivden çıkarıldı"},"pinned":{"enabled":"%{when} sabitlendi","disabled":"%{when} sabitlikten çıkarıldı"},"pinned_globally":{"enabled":"%{when} genel olarak sabitlendi","disabled":"%{when} genel olarak sabitleme kaldırıldı"},"visible":{"enabled":"%{when} listelendi","disabled":"%{when} listelenmedi"}},"topic_admin_menu":"konuyla alakalı yönetici işlemleri","emails_are_disabled":"Tüm giden e-postalar yönetici tarafından evrensel olarak devre dışı bırakıldı. Herhangi bir e-posta bildirimi gönderilmeyecek.","edit":"bu konunun başlığını ve kategorisini düzenleyin","not_implemented":"Bu özellik henüz geliştirilmedi, üzgünüz!","no_value":"Hayır","yes_value":"Evet","generic_error":"Üzgünüz, bir hata oluştu.","generic_error_with_reason":"Bir hata oluştu: %{error}","sign_up":"Üye Ol","log_in":"Giriş Yap","age":"Yaş","joined":"Katıldı","admin_title":"Yönetici","flags_title":"Bayraklar","show_more":"devamını göster","show_help":"seçenekler","links":"Bağlantılar","links_lowercase":{"other":"bağlantılar"},"faq":"Sıkça Sorulan Sorular","guidelines":"Yönergeler","privacy_policy":"Gizlilik Sözleşmesi","privacy":"Gizlilik","terms_of_service":"Kullanım Koşulları","mobile_view":"Mobil Görünüm","desktop_view":"Masaüstü Görünüm","you":"Siz","or":"ya da","now":"hemen şimdi","read_more":"devamını oku","more":"Daha fazla","less":"Daha az","never":"asla","daily":"günlük","weekly":"haftalık","every_two_weeks":"her iki haftada bir","every_three_days":"her üç günde bir","max_of_count":"azami {{count}}","alternation":"ya da","character_count":{"other":"{{count}} karakter"},"suggested_topics":{"title":"Önerilen Konular"},"about":{"simple_title":"Hakkında","title":"%{title} Hakkında","stats":"Site İstatistikleri","our_admins":"Yöneticilerimiz","our_moderators":"Moderatörlerimiz","stat":{"all_time":"Tüm Zamanlar","last_7_days":"Son 7 gün","last_30_days":"Son 30 gün"},"like_count":"Beğeni","topic_count":"Konular","post_count":"Gönderiler","user_count":"Yeni Kullanıcılar","active_user_count":"Aktif Kullanıcılar","contact":"Bize Ulaşın","contact_info":"Bu siteyi etkileyen kritik bir problem ya da acil bir durum oluştuğunda, lütfen %{contact_info} adresi üzerinden bizimle iletişime geçin."},"bookmarked":{"title":"İşaretle","clear_bookmarks":"İşaretlenenleri Temizle","help":{"bookmark":"Bu konudaki ilk gönderiyi işaretlemek için tıklayın","unbookmark":"Bu konudaki bütün işaretleri kaldırmak için tıklayın"}},"bookmarks":{"not_logged_in":"üzgünüz, gönderileri işaretleyebilmeniz için oturum açmanız gerekiyor.","created":"bu gönderiyi işaretlediniz","not_bookmarked":"bu gönderiyi okudunuz; yer imlerinize eklemek için tıklayın","last_read":"bu okuduğunuz son gönderi; yer imlerinize eklemek için tıklayın","remove":"İşareti Kaldır","confirm_clear":"Bu konuya ait tüm işaretleri kaldırmak istediğinize emin misiniz?"},"topic_count_latest":{"other":"{{count}} yeni ya da güncellenmiş konu."},"topic_count_unread":{"other":"{{count}} okunmamış konu."},"topic_count_new":{"other":"{{count}} yeni konu."},"click_to_show":"Görüntülemek için tıklayın.","preview":"önizleme","cancel":"İptal","save":"Değişiklikleri Kaydet","saving":"Kaydediliyor...","saved":"Kaydedildi!","upload":"Yükle","uploading":"Yükleniyor...","uploading_filename":"{{filemame}} yükleniyor...","uploaded":"Yüklendi!","enable":"Etkinleştir","disable":"Devredışı Bırak","undo":"Geri Al","revert":"Eski Haline Getir","failed":"Başarısız oldu","switch_to_anon":"Anonim Ol","switch_from_anon":"Anonim Modundan Çık","banner":{"close":"Bu manşeti yoksay.","edit":"Bu manşeti düzenle \u003e\u003e"},"choose_topic":{"none_found":"Hiç bir konu bulunamadı.","title":{"search":"İsim, url ya da id ile başlık arayın:","placeholder":"konu başlığını buraya yazın"}},"queue":{"topic":"Konu:","approve":"Onayla","reject":"Reddet","delete_user":"Kullanıcıyı Sil","title":"Onay Gerektirir","none":"Gözden geçirilecek bir gönderi yok.","edit":"Düzenle","cancel":"İptal","view_pending":"bekleyen yazıları görüntüleyin","has_pending_posts":{"other":"Bu konuda \u003cb\u003e{{count}}\u003c/b\u003e sayıda onay bekleyen gönderi var"},"confirm":"Düzenlemeleri Kaydet","delete_prompt":"\u003cb\u003e%{username}\u003c/b\u003e kullanıcısını silmek istediğinize emin misiniz? Bu işlem kullanıcının tüm gönderilerini silecek, e-posta ve ip adresini engelleyecek.","approval":{"title":"Gönderi Onay Gerektirir","description":"Gönderinizi aldık fakat gösterilmeden önce bir moderatör tarafından onaylanması gerekiyor. Lütfen sabırlı olun.","pending_posts":{"other":"Bekleyen \u003cstrong\u003e{{count}}\u003c/strong\u003e yazınız bulunmaktadır."},"ok":"Tamam"}},"user_action":{"user_posted_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{topicUrl}}'\u003ekonuyu\u003c/a\u003e açtı","you_posted_topic":"\u003ca href='{{topicUrl}}'\u003ekonuyu\u003c/a\u003e \u003ca href='{{userUrl}}'\u003esen\u003c/a\u003e açtın","user_replied_to_post":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e gönderiyi cevapladı","you_replied_to_post":"\u003ca href='{{postUrl}}'\u003e{{post_number}}\u003c/a\u003e gönderiyi \u003ca href='{{userUrl}}'\u003esen\u003c/a\u003e cevapladın","user_replied_to_topic":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e  \u003ca href='{{topicUrl}}'\u003ekonuya\u003c/a\u003e cevap verdi","you_replied_to_topic":"\u003ca href='{{userUrl}}'\u003eSiz\u003c/a\u003e  \u003ca href='{{topicUrl}}'\u003ekonuya\u003c/a\u003e cevap verdiniz","user_mentioned_user":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e adlı kullanıcıdan bahsetti","user_mentioned_you":"\u003ca href='{{user1Url}}'\u003e{{user}}\u003c/a\u003e \u003ca href='{{user2Url}}'\u003esizden\u003c/a\u003e bahsetti","you_mentioned_user":"\u003ca href='{{user1Url}}'\u003eSiz\u003c/a\u003e, \u003ca href='{{user2Url}}'\u003e{{another_user}}\u003c/a\u003e adlı kullanıcıdan bahsettiniz","posted_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e tarafından gönderildi","posted_by_you":"\u003ca href='{{userUrl}}'\u003eSizin\u003c/a\u003e tarafınızdan gönderildi","sent_by_user":"\u003ca href='{{userUrl}}'\u003e{{user}}\u003c/a\u003e tarafından yollandı","sent_by_you":"\u003ca href='{{userUrl}}'\u003eSizin\u003c/a\u003e tarafınızdan yollandı"},"directory":{"filter_name":"kullanıcı adına göre filtrele","title":"Kullanıcılar","likes_given":"Verilen","likes_received":"Alınan","topics_entered":"Açıldı","topics_entered_long":"Açılan Konular","time_read":"Okuma Zamanı","topic_count":"Konular","topic_count_long":"Oluşturulan Konular","post_count":"Cevap","post_count_long":"Gönderilen Cevaplar","no_results":"Sonuç bulunamadı.","days_visited":"Ziyaretler","days_visited_long":"Ziyaret Günü","posts_read":"Okunmuşlar","posts_read_long":"Okunmuş Gönderiler","total_rows":{"other":"%{count} kullanıcı"}},"groups":{"add":"Ekle","selector_placeholder":"Üye ekle","owner":"sahip","visible":"Grup tüm kullanıcılar tarafından görüntülenebiliyor","title":{"other":"gruplar"},"members":"Üyeler","posts":"Gönderiler","alias_levels":{"title":"Kimler bu grubu ikinci adı olarak kullanabilir?","nobody":" Hiç Kimse","only_admins":"Sadece Yöneticiler","mods_and_admins":"Sadece Moderatörler ve Yöneticiler","members_mods_and_admins":"Sadece Grup Üyeleri, Moderatörler ve Yöneticiler","everyone":"Herkes"},"trust_levels":{"title":"Eklendiklerinde üyelere otomatik olarak güven seviyesi verilir:","none":"Hiç"}},"user_action_groups":{"1":"Verilen Beğeniler","2":"Alınan Beğeniler","3":"İşaretlenenler","4":"Konular","5":"Cevaplar","6":"Yanıtlar","7":"Bahsedenler","9":"Alıntılar","10":"Yıldızlılar","11":"Düzenlemeler","12":"Yollanmış ögeler","13":"Gelen Kutusu","14":"Bekleyen"},"categories":{"all":"Tüm Kategoriler","all_subcategories":"hepsi","no_subcategory":"hiçbiri","category":"Kategori","reorder":{"title":"Kategorileri Yeniden Sırala","title_long":"Kategori listesini yeniden yapılandır","fix_order":"Konumları Onar","fix_order_tooltip":"Bütün kategoriler eşsiz bir konum numarasına sabit değil, bu beklenmedik sonuçlara neden olabilir.","save":"Sıralamayı Kaydet","apply_all":"Uygula","position":"Konum"},"posts":"Gönderiler","topics":"Konular","latest":"En Son","latest_by":"son gönderen","toggle_ordering":"sıralama kontrolünü aç/kapa","subcategories":"Alt kategoriler","topic_stats":"Yeni konuların sayısı.","topic_stat_sentence":{"other":"%{unit} beri %{count} yeni konu."},"post_stats":"Yeni gönderilerin sayısı.","post_stat_sentence":{"other":"%{unit} beri %{count} yeni gönderi."}},"ip_lookup":{"title":"IP Adresi Ara","hostname":"Sunucu ismi","location":"Yer","location_not_found":"(bilinmeyen)","organisation":"Organizasyon","phone":"Telefon","other_accounts":"Bu IP adresine sahip diğer hesaplar:","delete_other_accounts":"Sil %{count}","username":"kullanıcı adı","trust_level":"TL","read_time":"okunma zamanı","topics_entered":"açılan konular","post_count":"# gönderi","confirm_delete_other_accounts":"Bu hesapları silmek isteğinize emin misiniz?"},"user_fields":{"none":"(bir seçenek seçin)"},"user":{"said":"{{username}}:","profile":"Profil","mute":"Sustur","edit":"Ayarları Düzenle","download_archive":"Gönderilerimi İndir","new_private_message":"Yeni Mesaj","private_message":"Mesaj","private_messages":"Mesajlar","activity_stream":"Aktivite","preferences":"Seçenekler","expand_profile":"Genişlet","bookmarks":"İşaretlenenler","bio":"Hakkımda","invited_by":"Tarafından Davet Edildi","trust_level":"Güven Seviyesi","notifications":"Bildirimler","desktop_notifications":{"label":"Masaüstü Bildirimleri","not_supported":"Bildirimler bu tarayıcıda desteklenmiyor. Üzgünüz.","perm_default":"Bildirimleri Etkinleştirin","perm_denied_btn":"Erişim İzni Reddedildi","perm_denied_expl":"Bildirimler için gerekli izne sahip değilsiniz. Bildirimleri etkinleştirmek için tarayıcınızı kullanın, işlem tamamlandığında tuşa basın. (Masaüstü: Adres çubuğunda en soldaki simge. Mobil: 'Site Bilgisi'.)","disable":"Bildirimleri Devre Dışı Bırakın","currently_enabled":"(şu anda etkin)","enable":"Bildirimleri Etkinleştirin","currently_disabled":"(şu anda devre dışı)","each_browser_note":"Not: Bu ayarı kullandığınız her tarayıcıda değiştirmelisiniz."},"dismiss_notifications":"Hepsini okunmuş olarak işaretle","dismiss_notifications_tooltip":"Tüm okunmamış bildirileri okunmuş olarak işaretle","disable_jump_reply":"Cevapladıktan sonra gönderime atlama","dynamic_favicon":"Tarayıcı simgesinde yeni / güncellenen konu sayısını göster","edit_history_public":"Gönderimde yaptığım revizyonları diğer kullanıcıların görmesine izin ver","external_links_in_new_tab":"Tüm dış bağlantıları yeni sekmede aç","enable_quoting":"Vurgulanan yazıyı alıntılayarak cevaplama özelliğini etkinleştir","change":"değiştir","moderator":"{{user}} bir moderatördür","admin":"{{user}} bir yöneticidir","moderator_tooltip":"Bu kullanıcı bir moderatör","admin_tooltip":"Bu kullanıcı bir yönetici.","blocked_tooltip":"Bu kullanıcı engellendi","suspended_notice":"Bu kullanıcı {{tarih}} tarihine kadar uzaklaştırıldı.","suspended_reason":"Neden:","github_profile":"Github","mailing_list_mode":"(Konuyu veya kategoriyi susturmadığım takdirde) her yeni gönderi için bana bir e-posta yolla","watched_categories":"Gözlendi","watched_categories_instructions":"Bu kategorilerdeki tüm yeni konuları otomatik olarak gözleyeceksiniz. Tüm yeni gönderi ve konular size bildirilecek. Ayrıca, okunmamış ve yeni gönderilerin sayısı ilgili konunun yanında belirecek.","tracked_categories":"Takip edildi","tracked_categories_instructions":"Bu kategorilerdeki tüm yeni konuları otomatik olarak takip edeceksiniz. Okunmamış ve yeni gönderilerin sayısı ilgili konunun yanında belirecek.","muted_categories":"Susturuldu","muted_categories_instructions":"Bu kategorilerdeki yeni konular hakkında herhangi bir bildiri almayacaksınız ve en son gönderilerde belirmeyecekler. ","delete_account":"Hesabımı Sil","delete_account_confirm":"Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlemi geri alamazsınız!","deleted_yourself":"Hesabınız başarıyla silindi.","delete_yourself_not_allowed":"Hesabınızı şu an silemezsiniz. Hesabınızı silmesi için bir yönetici ile iletişime geçin.","unread_message_count":"Mesajlar","admin_delete":"Sil","users":"Kullanıcılar","muted_users":"Susturuldu","muted_users_instructions":"Bu kullanıcılardan gelen tüm bildirileri kapa.","muted_topics_link":"Sessize alınmış konuları göster","automatically_unpin_topics":"Sayfa sonuna erişildiğinde tutturulmuş konuları otomatik olarak sayfadan ayır.","staff_counters":{"flags_given":"yararlı bayraklar","flagged_posts":"bayraklanan gönderiler","deleted_posts":"silinen gönderiler","suspensions":"uzaklaştırmalar","warnings_received":"uyarılar"},"messages":{"all":"Hepsi","mine":"Benimkiler","unread":"Okunmamışlar"},"change_password":{"success":"(e-posta gönderildi)","in_progress":"(e-posta yollanıyor)","error":"(hata)","action":"Parola Sıfırlama E-postası Gönder","set_password":"Parola Belirle"},"change_about":{"title":"Hakkımda'yı Değiştir","error":"Değer değiştirilirken bir hata oluştu."},"change_username":{"title":"Kullanıcı Adını Değiştir","confirm":"Kullanıcı adınızı degiştirmeniz halinde, eski gönderilerinizden yapılan tüm alıntılar ve @isim bahsedilişler bozulacak. Bunu yapmak istediginize gerçekten emin misiniz?","taken":"Üzgünüz, bu kullanıcı adı alınmış.","error":"Kullanıcı adınızı değiştirirken bir hata oluştu.","invalid":"Bu kullanıcı adı geçersiz. Sadece sayı ve harf içermelidir."},"change_email":{"title":"E-posta Adresini Değiştirin","taken":"Üzgünüz, bu e-posta kullanılabilir değil.","error":"E-posta adresinizi değiştirirken bir hata oluştu. Belki bu adres zaten kullanımdadır?","success":"Adresinize bir e-posta gönderdik. Lütfen onaylama talimatlarını uygulayınız."},"change_avatar":{"title":"Profil görselinizi değiştirin","gravatar":"\u003ca href='//gravatar.com/emails' target='_blank'\u003eGravatar\u003c/a\u003e, baz alındı","gravatar_title":"Profil görselinizi Gravatar sitesinde değiştirin","refresh_gravatar_title":"Profil görselinizi yenileyin","letter_based":"Sistem tarafından verilen profil görseli","uploaded_avatar":"Özel resim","uploaded_avatar_empty":"Özel resim ekleyin","upload_title":"Resminizi yükleyin","upload_picture":"Resim Yükle","image_is_not_a_square":"Uyarı: resminizi kırptık; genişlik ve yükseklik eşit değildi.","cache_notice":"Profil resminizi başarıyla değiştirdiniz fakat tarayıcı önbelleklemesi nedeniyle görünür olması biraz zaman alabilir."},"change_profile_background":{"title":"Profil Arkaplanı","instructions":"Profil arkaplanları ortalanacak ve genişlikleri 850px olacak. "},"change_card_background":{"title":"Kullanıcı Kartı Arkaplanı","instructions":"Profil arkaplanları ortalanacak ve genişlikleri 590px olacak. "},"email":{"title":"E-posta","instructions":"Kimseye gösterilmeyecek.","ok":"Onay için size e-posta atacağız","invalid":"Lütfen geçerli bir e-posta adresini giriniz","authenticated":"E-posta adresiniz {{provider}} tarafından doğrulanmıştır","frequency_immediately":"Eğer yollamak üzere olduğumuz şeyi okumadıysanız size direk e-posta yollayacağız.","frequency":{"other":"Sadece son {{count}} dakika içinde sizi görmediysek e-posta yollayacağız."}},"name":{"title":"İsim","instructions":"Tam adınız (zorunlu değil)","instructions_required":"Tam adınız","too_short":"İsminiz çok kısa","ok":"İsminiz iyi görünüyor"},"username":{"title":"Kullanıcı adı","instructions":"Özgün, boşluksuz ve kısa","short_instructions":"Kullanıcılar sizden @{{username}} olarak bahsedebilirler.","available":"Kullanıcı adınız müsait","global_match":"E-posta kayıtlı kullanıcı adıyla eşleşiyor","global_mismatch":"Zaten mevcut. {{suggestion}} deneyin?","not_available":"Müsait değil. {{suggestion}} deneyin?","too_short":"Kullanıcı adınız çok kısa","too_long":"Kullanıcı adınız çok uzun","checking":"Kullanıcı adı müsait mi kontrol ediliyor...","enter_email":"Kullanıcı adı bulundu; eşleşen e-posta adresini girin","prefilled":"E-posta bu kullanıcı adı ile eşleşiyor"},"locale":{"title":"Arayüz dili","instructions":"Kullanıcı arayüzünün dili. Sayfayı yenilediğiniz zaman değişecektir.","default":"(varsayılan)"},"password_confirmation":{"title":"Tekrar Parola"},"last_posted":"Son Gönderi","last_emailed":"Son E-posta Atılan","last_seen":"Son Görülme","created":"Katıldı","log_out":"Oturumu Kapat","location":"Yer","card_badge":{"title":"Kullanıcı Kartı Rozeti"},"website":"Web Sayfası","email_settings":"E-posta","email_digests":{"title":"Burayı ziyaret etmediğim zamanlarda bana yeni şeylerin özetini içeren bir email yolla:","daily":"günlük","every_three_days":"her üç günde bir","weekly":"haftalık","every_two_weeks":"her iki haftada bir"},"email_direct":"Birisi gönderime cevap verdiğinde, benden alıntı yaptığında, @username şeklinde bahsettiğinde ya da beni bir konuya davet ettiğinde bana bir email at","email_private_messages":"Biri bana mesaj yazdığında bana bir email at","email_always":"Sitede aktif olduğum sıralarda bile bana e-posta bildirimleri gönder","other_settings":"Diğer","categories_settings":"Kategoriler","new_topic_duration":{"label":"Seçili durumdaki konular yeni sayılsın","not_viewed":"Onları henüz görüntülemedim","last_here":"son ziyaretimden beri oluşturulanlar","after_1_day":"son 1 gün içinde oluşturuldu","after_2_days":"son 2 gün içinde oluşturuldu","after_1_week":"son 1 hafta içinde oluşturuldu","after_2_weeks":"son 2 hafta içinde oluşturuldu"},"auto_track_topics":"Girdiğim konuları otomatik olarak takip et","auto_track_options":{"never":"asla","immediately":"hemen","after_30_seconds":"30 saniye sonra","after_1_minute":"1 dakika sonra","after_2_minutes":"2 dakika sonra","after_3_minutes":"3 dakika sonra","after_4_minutes":"4 dakika sonra","after_5_minutes":"5 dakika sonra","after_10_minutes":"10 dakika sonra"},"invited":{"search":"davetiye aramak için yazın...","title":"Davetler","user":"Davet Edilen Kullanıcı","sent":"Gönderildi","none":"Bekleyen davet yok.","truncated":{"other":"ilk {{count}} davet gösteriliyor."},"redeemed":"Kabul Edilen Davetler","redeemed_tab":"Kabul Edildi","redeemed_tab_with_count":"İtfa edilmiş ({{count}})","redeemed_at":"Kabul Edildi","pending":"Bekleyen Davetler","pending_tab":"Bekleyen","pending_tab_with_count":"Beklemede ({{count}})","topics_entered":"Görüntülenmiş Konular","posts_read_count":"Okunmuş Yazılar","expired":"Bu davetin süresi doldu.","rescind":"Kaldır","rescinded":"Davet kaldırıldı","reinvite":"Davetiyeyi Tekrar Yolla","reinvited":"Davetiye tekrar yollandı","time_read":"Okunma Zamanı","days_visited":"Ziyaret Edilen Günler","account_age_days":"Gün içinde Hesap yaş","create":"Davet Yolla","generate_link":"Davet bağlantısını kopyala","generated_link_message":"\u003cp\u003eDavet bağlantısı başarılı bir şekilde oluşturuldu!\u003c/p\u003e\u003cp\u003e\u003cinput class=\"invite-link-input\" style=\"width: 75%;\" type=\"text\" value=\"%{inviteLink}\"\u003e\u003c/p\u003e\u003cp\u003eDavet bağlantısı sadece bu e-posta adresi için geçerlidir: \u003cb\u003e%{invitedEmail}\u003c/b\u003e\u003c/p\u003e","bulk_invite":{"none":"Henüz kimseyi buraya davet etmediniz. Tek tek davetiye gönderebilirsiniz, ya da \u003ca href='https://meta.discourse.org/t/send-bulk-invites/16468'\u003etoplu bir davetiye dosyası yükleyerek\u003c/a\u003e birçok kişiyi aynı anda davet edebilirsiniz. ","text":"Dosyadan Toplu Davet Gönder","uploading":"Yükleniyor...","success":"Dosya başarıyla yüklendi, işlem tamamlandığında mesajla bilgilendirileceksiniz.","error":"'{{filename}}' yüklenirken bir hata oluştu: {{message}}"}},"password":{"title":"Parola","too_short":"Parolanız çok kısa.","common":"Bu parola çok yaygın.","same_as_username":"Şifreniz kullanıcı adınızla aynı.","same_as_email":"Şifreniz e-posta adresinizle aynı.","ok":"Parolanız uygun gözüküyor.","instructions":"En az %{count} karakter."},"associated_accounts":"Girişler","ip_address":{"title":"Son IP Adresi"},"registration_ip_address":{"title":"Kayıt Anındaki IP Adresi"},"avatar":{"title":"Profil Görseli","header_title":"profil, mesajlar, işaretliler ve seçenekler"},"title":{"title":"Başlık"},"filters":{"all":"Hepsi"},"stream":{"posted_by":"Gönderen","sent_by":"Yollayan","private_message":"mesaj","the_topic":"konu"}},"loading":"Yükleniyor...","errors":{"prev_page":"yüklemeye çalışırken","reasons":{"network":"Network Hatası","server":"Sunucu Hatası","forbidden":"Erişim Reddedildi","unknown":"Hata","not_found":"Sayfa Bulunamadı"},"desc":{"network":"Lütfen bağlantınızı kontrol edin.","network_fixed":"Geri döndü gibi gözüküyor.","server":"Hata kodu : {{status}}","forbidden":"Bunu görüntülemeye izniniz yok.","not_found":"Hoppala, uygulama var olmayan bir URL'i yüklemeye çalıştı.","unknown":"Bir şeyler ters gitti."},"buttons":{"back":"Geri Dönün","again":"Tekrar Deneyin","fixed":"Sayfayı Yükle"}},"close":"Kapat","assets_changed_confirm":"Bu site yeni versiyona güncellendi. Son hali için sayfayı yenilemek ister misiniz?","logout":"Çıkış yapıldı.","refresh":"Yenile","read_only_mode":{"enabled":"Salt-okunur modu etkin. Siteyi gezmeye devam edebilirsiniz fakat etkileşimler çalışmayabilir.","login_disabled":"Site salt-okunur modda iken oturum açma devre dışı bırakılır ."},"too_few_topics_and_posts_notice":"Hadi \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ebu tartışmayı başlatalım!\u003c/a\u003e Şu anda \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e konu ve \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e gönderi var. Yeni ziyaretçiler okumak ve yanıtlamak için birkaç tartışmaya ihtiyaç duyarlar.","too_few_topics_notice":"Hadi \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ebu tartışmayı başlatalım!\u003c/a\u003e Şu anda \u003cstrong\u003e%{currentTopics} / %{requiredTopics}\u003c/strong\u003e konu var. Yeni ziyaretçiler okumak ve yanıtlamak için birkaç tartışmaya ihtiyaç duyarlar.","too_few_posts_notice":"Hadi \u003ca href='http://blog.discourse.org/2014/08/building-a-discourse-community/'\u003ebu tartışmayı başlatalım!\u003c/a\u003e Şu anda \u003cstrong\u003e%{currentPosts} / %{requiredPosts}\u003c/strong\u003e gönderi var. Yeni ziyaretçiler okumak ve yanıtlamak için birkaç tartışmaya ihtiyaç duyarlar.","learn_more":"daha fazlasını öğren...","year":"yıl","year_desc":"son 365 günde oluşturulan konular","month":"ay","month_desc":"son 30 günde oluşturulan konular","week":"hafta","week_desc":"son 7 günde oluşturulan konular","day":"gün","first_post":"İlk gönderi","mute":"Sustur","unmute":"Susturma","last_post":"Son gönderi","last_reply_lowercase":"son cevap","replies_lowercase":{"other":"cevap"},"signup_cta":{"sign_up":"Üye Ol","hide_session":"Yarın bana hatırlat","hide_forever":"hayır teşekkürler","hidden_for_session":"Tamamdır, yarın tekrar soracağım. İstediğiniz zaman 'Giriş' yaparak da hesap oluşturabilirsiniz.","intro":"Nabersin! heart_eyes: Görüneşe göre tartışmaların keyfini çıkaryorsun, fakat henüz bir hesap almak için kayıt olmamışsın.","value_prop":"Bir hesap oluşturduğunuzda, tam olarak neyi okuyor olduğunuzu hatırlarız, böylece her zaman okumayı bırakmış olduğunuz yere geri gelirsiniz.  Ayrıca burada, yeni gönderiler yağıldığında email yoluyla bildirim alırsınız. Ve sevgiyi paylaşmak için gönderileri beğenebilirsiniz. :heartbeat:"},"summary":{"enabled_description":"Bu konunun özetini görüntülemektesiniz: topluluğun en çok ilgisini çeken gönderiler","description":"\u003cb\u003e{{count}}\u003c/b\u003e sayıda cevap var.","description_time":"Tahmini okunma süresi \u003cb\u003e{{readingTime}} dakika\u003c/b\u003e olan \u003cb\u003e{{count}}\u003c/b\u003e sayıda cevap var.","enable":"Bu Konuyu Özetle.","disable":"Tüm Gönderileri Göster"},"deleted_filter":{"enabled_description":"Bu konu gizlenen silinmiş gönderiler içeriyor.","disabled_description":"Bu konuda silinen gönderiler gösteriliyor.","enable":"Silinen Gönderileri Gizle","disable":"Silinen Gönderileri Göster"},"private_message_info":{"title":"Mesaj","invite":"Diğerlerini Davet Et...","remove_allowed_user":"Bu mesajlaşmadan {{name}} isimli kullanıcıyı çıkarmak istediğinize emin misiniz?"},"email":"E-posta","username":"Kullanıcı Adı","last_seen":"Son Görülme","created":"Oluşturuldu","created_lowercase":"oluşturuldu","trust_level":"Güven Seviyesi","search_hint":"kullanıcı adı, e-posta veya IP adresi","create_account":{"title":"Yeni Hesap Oluştur","failed":"Bir şeyler ters gitti. Bu e-posta adına daha önce bir kayıt oluşturulmuş olabilir, parolamı unuttum bağlantısını dene."},"forgot_password":{"title":"Parola Sıfırla","action":"Parolamı unuttum","invite":"Kullanıcı adınızı ya da e-posta adresinizi girin, size parola sıfırlama e-postası yollayalım.","reset":"Parola Sıfırla","complete_username":" \u003cb\u003e%{username}\u003c/b\u003e kullanıcı adı ile eşleşen bir hesap bulunması durumunda, kısa bir süre içerisinde parolanızı nasıl sıfırlayacağınızı açıklayan bir e-posta alacaksınız.","complete_email":" \u003cb\u003e%{email}\u003c/b\u003e adresi ile eşleşen bir hesap bulunması durumunda, kısa bir süre içerisinde parolanızı nasıl sıfırlayacağınızı açıklayan bir e-posta alacaksınız.","complete_username_found":"\u003cb\u003e%{username}\u003c/b\u003e kullanıcı adı ile eşleşen bir hesap bulduk, kısa bir süre içerisinde parolanızı nasıl sıfırlayacağınızı açıklayan bir e-posta alacaksınız.","complete_email_found":"\u003cb\u003e%{email}\u003c/b\u003e adresi ile eşleşen bir hesap bulduk, kısa bir süre içerisinde parolanızı nasıl sıfırlayacağınızı açıklayan bir e-posta alacaksınız.","complete_username_not_found":"Hiçbir hesap kullanıcı adı \u003cb\u003e%{username}\u003c/b\u003e ile eşleşmiyor","complete_email_not_found":"Hiçbir hesap \u003cb\u003e%{email}\u003c/b\u003e adresi ile eşleşmiyor"},"login":{"title":"Giriş Yap","username":"Kullanıcı","password":"Parola","email_placeholder":"e-posta veya kullanıcı adı","caps_lock_warning":"Caps Lock açık","error":"Bilinmeyen hata","rate_limit":"Tekrar giriş yapmayı denemeden önce lütfen bekleyin.","blank_username_or_password":"Lütfen e-posta adresinizi ya da kullanıcı adınızı, ve parolanızı girin.","reset_password":"Parola Sıfırlama","logging_in":"Oturum açılıyor...","or":"ya da","authenticating":"Kimliğiniz doğrulanıyor...","awaiting_confirmation":"Hesabınız etkinleştirilmemiş. Yeni bir etkinleştirme e-postası almak için parolamı unuttum bağlantısını kullanabilirsiniz. ","awaiting_approval":"Hesabınız henüz bir görevli tarafından onaylanmadı. Onaylandığında e-posta ile haberdar edileceksiniz.","requires_invite":"Üzgünüz, bu foruma sadece davetliler erişebilir.","not_activated":"Henüz oturum açamazsınız. Hesabınızı etkinleştirmek için lütfen daha önceden \u003cb\u003e{{sentTo}}\u003c/b\u003e adresine yollanan etkinleştirme e-postasındaki açıklamaları okuyun.","not_allowed_from_ip_address":"Bu IP adresiyle oturum açamazsınız.","admin_not_allowed_from_ip_address":"Bu IP adresinden yönetici olarak oturum açamazsınız.","resend_activation_email":"Etkinleştirme e-postasını tekrar yollamak için buraya tıklayın. ","sent_activation_email_again":"\u003cb\u003e{{currentEmail}}\u003c/b\u003e adresine yeni bir etkinleştirme e-postası yolladık. Bu e-postanın size ulaşması bir kaç dakika sürebilir; spam klasörüzü kontrol etmeyi unutmayın.","to_continue":"Lütfen Giriş Yap","preferences":"Seçeneklerinizi değiştirebilmek için giriş yapmanız gerekiyor.","forgot":"Hesap bilgilerimi hatırlamıyorum","google":{"title":"Google ile","message":"Google ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"},"google_oauth2":{"title":"Google ile","message":"Google ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"},"twitter":{"title":"Twitter ile","message":"Twitter ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"},"facebook":{"title":"Facebook ile","message":"Facebook ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"},"yahoo":{"title":"Yahoo ile","message":"Yahoo ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"},"github":{"title":"GitHub ile","message":"GitHub ile kimlik doğrulaması yapılıyor (pop-up engelleyicilerin etkinleştirilmediğinden emin olun)"}},"apple_international":"Apple/Uluslararası","google":"Google","twitter":"Twitter","emoji_one":"Emoji One","shortcut_modifier_key":{"shift":"Shift","ctrl":"Ctrl","alt":"Alt"},"composer":{"emoji":"Emoji :smile:","more_emoji":"dahası...","options":"Seçenekler","whisper":"fısıltı","add_warning":"Bu resmi bir uyarıdır.","toggle_whisper":"Fısıldamayı Göster/Gizle","posting_not_on_topic":"Hangi konuyu cevaplamak istiyorsun?","saving_draft_tip":"kaydediliyor...","saved_draft_tip":"kaydedildi","saved_local_draft_tip":"yerele kaydedildi","similar_topics":"Konunuz şunlara çok benziyor...","drafts_offline":"çevrimdışı taslaklar","error":{"title_missing":"Başlık gerekli","title_too_short":"Başlık en az {{min}} karakter olmalı","title_too_long":"Başlık {{max}} karakterden daha uzun olamaz","post_missing":"Gönderiler boş olamaz","post_length":"Gönderi en az {{min}} karakter olmalı","try_like":"\u003ci class=\"fa fa-heart\"\u003e\u003c/i\u003e butonunu denediniz mi?","category_missing":"Bir kategori seçmelisiniz"},"save_edit":"Değişikliği Kaydet","reply_original":"Ana Konuyu Cevapla","reply_here":"Buradan Cevapla","reply":"Cevapla","cancel":"İptal et","create_topic":"Konu Oluştur","create_pm":"Mesaj","title":"Ya da Ctrl+Enter'a bas","users_placeholder":"Kullanıcı ekle","title_placeholder":"Bir cümlede açıklamak gerekirse bu tartışmanın konusu nedir?","edit_reason_placeholder":"neden düzenleme yapıyorsunuz?","show_edit_reason":"(düzenleme sebebi ekle)","reply_placeholder":"Buraya yazın. Biçimlendirmek için Markdown, BBCode ya da HTML kullanabilirsin. Resimleri sürükleyebilir ya da yapıştırabilirsin.","view_new_post":"Yeni gönderinizi görüntüleyin.","saving":"Kaydediliyor","saved":"Kaydedildi!","saved_draft":"Gönderi taslağı işleniyor. Geri almak için seçin. ","uploading":"Yükleniyor...","show_preview":"önizlemeyi göster \u0026raquo;","hide_preview":"\u0026laquo; önizlemeyi gizle","quote_post_title":"Tüm gönderiyi alıntıla","bold_title":"Kalın","bold_text":"kalın yazı","italic_title":"Vurgular","italic_text":"vurgulanan yazı","link_title":"Bağlantı","link_description":"buraya bağlantı açıklamasını girin","link_dialog_title":"Bağlantı ekle","link_optional_text":"opsiyonel başlık","link_placeholder":"http://example.com \"isteğe bağlı yazı\"","quote_title":"Blok-alıntı","quote_text":"Blok-alıntı","code_title":"Önceden biçimlendirilmiş yazı","code_text":"paragraf girintisi 4 boşluktan oluşan, önceden biçimlendirilen yazı","upload_title":"Yükle","upload_description":"yükleme açıklamasını buraya girin","olist_title":"Numaralandırılmış Liste","ulist_title":"Madde İşaretli Liste","list_item":"Liste öğesi","heading_title":"Başlık","heading_text":"Başlık","hr_title":"Yatay Çizgi","help":"Markdown Düzenleme Yardımı","toggler":"yazım alanını gizle veya göster","modal_ok":"Tamam","modal_cancel":"İptal","cant_send_pm":"Üzgünüz, %{username} kullanıcısına mesaj gönderemezsiniz.","admin_options_title":"Bu konu için opsiyonel görevli ayarları","auto_close":{"label":"Başlığı otomatik kapatma zamanı:","error":"Lütfen geçerli bir değer giriniz.","based_on_last_post":"Başlıktaki son gönderi de en az bu kadar eskiyinceye kadar kapatmayın.","all":{"examples":"Saat sayısı (24), kesin zaman (17:30) ya da zaman damgası (2013-11-22 14:00) girin."},"limited":{"units":"(saat sayısı)","examples":"Saat sayısını giriniz (24)."}}},"notifications":{"title":"@isim bahsedilişleri, gönderileriniz ve konularınıza verilen cevaplar, mesajlarla vb. ilgili bildiriler","none":"Şu an için bildirimler yüklenemiyor.","more":"daha eski bildirimleri görüntüle","total_flagged":"tüm bayraklanan gönderiler","mentioned":"\u003ci title='bahsetti' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","quoted":"\u003ci title='alıntıladı' class='fa fa-quote-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","replied":"\u003ci title='cevapladı' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","posted":"\u003ci title='cevapladı' class='fa fa-reply'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","edited":"\u003ci title='düzenledi' class='fa fa-pencil'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","liked":"\u003ci title='liked' class='fa fa-heart'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","private_message":"\u003ci title='özel mesaj' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_private_message":"\u003ci title='özel mesaj' class='fa fa-envelope-o'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invited_to_topic":"\u003ci title='konuya davet edildi' class='fa fa-hand-o-right'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","invitee_accepted":"\u003ci title='davetiyeni kabul etti' class='fa fa-user'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e davetini kabul etti!\u003c/p\u003e","moved_post":"\u003ci title='gönderiyi taşıdı' class='fa fa-sign-out'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e taşıdı {{description}}\u003c/p\u003e","linked":"\u003ci title='gönderiye bağlantı verdi' class='fa fa-arrow-left'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e","granted_badge":"\u003ci title='badge granted' class='fa fa-certificate'\u003e\u003c/i\u003e\u003cp\u003e\u003cstrong\u003e{{description}}\u003c/strong\u003e rozeti kazandınız!\u003c/p\u003e","alt":{"mentioned":"Bahsedildi, şu kişi tarafından","quoted":"Alıntılandı, şu kişi tarafından","replied":"Cevaplandı","posted":"Gönderildi, şu kişi tarafından","edited":"Gönderiniz düzenlendi, şu kişi tarafından","liked":"Gönderiniz beğenildi","private_message":"Özel mesaj, şu kişiden","invited_to_private_message":"Bir özel mesaja davet edildiniz, şu kişi tarafından","invited_to_topic":"Bir konuya davet edildiniz, şu kişi tarafından","invitee_accepted":"Davet kabul edildi, şu kişi tarafından","moved_post":"Gönderiniz taşındı, şu kişi tarafından","linked":"Gönderinize bağlantı","granted_badge":"Rozet alındı"},"popup":{"mentioned":"{{username}}, \"{{topic}}\" başlıklı konuda sizden bahsetti - {{site_title}}","quoted":"{{username}}, \"{{topic}}\" başlıklı konuda sizden alıntı yaptı - {{site_title}}","replied":"{{username}}, \"{{topic}}\" başlıklı konuda size cevap verdi - {{site_title}}","posted":"{{username}}, \"{{topic}}\" başlıklı konuya yazdı - {{site_title}}","private_message":"{{username}}, \"{{topic}}\" başlıklı konuda size özel mesaj gönderdi - {{site_title}}","linked":"{{username}}, \"{{topic}}\" başlıklı konudaki gönderinize bağlantı yaptı - {{site_title}}"}},"upload_selector":{"title":"Resim ekle","title_with_attachments":"Resim ya da dosya ekle","from_my_computer":"Kendi cihazımdan","from_the_web":"Webden","remote_tip":"resme bağlantı ver","remote_tip_with_attachments":"dosya yada imaj linki {{authorized_extensions}}","local_tip":"cihazınızdan resimler seçin","local_tip_with_attachments":"cihaınızdan imaj yada dosya seçin {{authorized_extensions}}","hint":"(editöre sürekle \u0026 bırak yaparak da yükleyebilirsiniz)","hint_for_supported_browsers":"ayrıca resimleri düzenleyiciye sürükleyip bırakabilir ya da yapıştırabilirsiniz","uploading":"Yükleniyor","select_file":"Dosya seçin","image_link":"resminizin yönleneceği bağlantı"},"search":{"sort_by":"Sırala","relevance":"Alaka","latest_post":"Son Gönderi","most_viewed":"En Çok Görüntülenen","most_liked":"En Çok Beğenilen","select_all":"Tümünü Seç","clear_all":"Tümünü Temizle","result_count":{"other":"\u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e için sonuçlar {{count}}"},"title":"konu, gönderi, kullanıcı veya kategori ara","no_results":"Hiç bir sonuç bulunamadı.","no_more_results":"Başka sonuç yok.","search_help":"Arama yardımı","searching":"Aranıyor...","post_format":"{{username}} tarafından #{{post_number}}","context":{"user":"@{{username}} kullancısına ait gönderilerde ara","category":"\"{{category}}\" kategorisinde ara","topic":"Bu konuda ara","private_messages":"Mesajlarda ara"}},"hamburger_menu":"bir diğer konu ya da kategoriye git","new_item":"yeni","go_back":"geri dön","not_logged_in_user":"güncel aktivitelerin ve ayarların özetinin bulunduğu kullanıcı sayfası","current_user":"kendi kullanıcı sayfana git","topics":{"bulk":{"unlist_topics":"Konuları Listeleme","reset_read":"Okunmuşları Sıfırla","delete":"Konuları Sil","dismiss":"Yoksay","dismiss_read":"Okumadıklarını yoksay","dismiss_button":"Yoksay...","dismiss_tooltip":"Yeni gönderileri görmezden gel yada konuları izlemeyi bırak","also_dismiss_topics":"Bu konuları gözlemeyi bırakıyor musunuz? (Konular, bundan sonra okunmamışlar sekmesi altında belirmeyecek)","dismiss_new":"Yenileri Yoksay","toggle":"konuların toplu seçimini aç/kapa","actions":"Toplu İşlemler","change_category":"Kategoriyi Değiştir","close_topics":"Konuları Kapat","archive_topics":"Konuları Arşivle","notification_level":"Bildirim Seviyesini Değiştir","choose_new_category":"Konular için yeni bir kategori seçin:","selected":{"other":"\u003cb\u003e{{count}}\u003c/b\u003e konu seçtiniz."}},"none":{"unread":"Okunmamış konunuz yok.","new":"Yeni konunuz yok.","read":"Henüz herhangi bir konu okumadınız.","posted":"Henüz herhangi bir konuda gönderi oluşturmadınız.","latest":"Son bir konu yok. Bu üzücü.","hot":"Sıcak bir konu yok.","bookmarks":"Henüz bir konu işaretlememişsiniz.","category":"{{category}} konusu yok.","top":"Popüler bir konu yok.","search":"Arama sonuçları yok.","educate":{"new":"\u003cp\u003eYeni konularınız burada belirir.\u003c/p\u003e\u003cp\u003eVarsayılan ayarlarda, son 2 gün içerisinde açılan konular yeni sayılır ve \u003cspan class=\"badge new-topic badge-notification\" style=\"vertical-align:middle;line-height:inherit;\"\u003eyeni\u003c/span\u003e işaretiyle gösterilir.\u003c/p\u003e\u003cp\u003eDilerseniz bu seçeneği \u003ca href=\"%{userPrefsUrl}\"\u003eayarlar\u003c/a\u003e sayfanızdan düzenleyebilirsiniz.\u003c/p\u003e","unread":"\u003cp\u003e Okunmamış konularınız burada belirecek. \u003c/p\u003e\u003cp\u003e Varsayılan ayarlarda, şu durumlarda konular okunmamış sayılır ve okunmamışların sayısı \u003cspan class=\"badge new-posts badge-notification\"\u003e1\u003c/span\u003e gösterilir: \u003c/p\u003e\u003cul\u003e\u003cli\u003eKonuyu oluşturduysanız\u003c/li\u003e\u003cli\u003eKonuyu cevapladıysanız\u003c/li\u003e\u003cli\u003eKonuyu 4 dakikadan uzun bir süre okuduysanız\u003c/li\u003e\u003c/ul\u003e\u003cp\u003e Ya da, konunun altında bulunan bildirim kontrol bölümünden, konuyu Takip Edildi veya Gözlendi diye işaretlediyseniz.\u003c/p\u003e\u003cp\u003eBu ayarları \u003ca href=\"%{userPrefsUrl}\"\u003eayarlar\u003c/a\u003e sayfasından değiştirebilirsiniz.\u003c/p\u003e"}},"bottom":{"latest":"Daha fazla son konu yok.","hot":"Daha fazla sıcak bir konu yok.","posted":"Daha fazla konu yok.","read":"Daha fazla okunmuş konu yok.","new":"Daha fazla yeni konu yok.","unread":"Daha fazla okunmamış konu yok.","category":"Daha fazla {{category}} konusu yok.","top":"Daha fazla popüler konu yok","bookmarks":"Daha fazla işaretlenmiş konu yok.","search":"Daha fazla arama sonucu yok."}},"topic":{"unsubscribe":{"stop_notifications":"Artık \u003cstrong\u003e{{title}}\u003c/strong\u003e için daha az bildirim alacaksınız.","change_notification_state":"Geçerli bildirim durumunuz"},"filter_to":"Bu konuda {{post_count}} gönderi","create":"Yeni Konu","create_long":"Yeni bir konu oluştur","private_message":"Mesajlaşma başlat","list":"Konular","new":"yeni konu","unread":"okunmamış","new_topics":{"other":"{{count}} yeni konu"},"unread_topics":{"other":"{{count}} okunmamış konu"},"title":"Konu","invalid_access":{"title":"Bu konu özel","description":"Üzgünüz, bu konuya erişiminiz yok!","login_required":"Bu konuyu görüntülemek için oturum açmanız gerekiyor."},"server_error":{"title":"Konu yüklenemedi.","description":"Üzgünüz, muhtemelen bir bağlantı sorunundan ötürü bu konuyu yükleyemedik. Lütfen tekrar deneyin. Eğer sorun devam ederse, bizimle iletişime geçin. "},"not_found":{"title":"Konu bulunamadı.","description":"Üzgünüz, bu konuyu bulamadık. Belki de moderatör tarafından kaldırıldı?"},"total_unread_posts":{"other":"bu konuda {{count}} okunmamış gönderi var"},"unread_posts":{"other":"bu konuda {{count}} tane okunmamış eski gönderi var"},"new_posts":{"other":"bu konuda, son okumanızdan bu yana {{count}} yeni gönderi var"},"likes":{"other":"bu konuda {{count}} beğeni var"},"back_to_list":"Konu listesine geri dön","options":"Konu Seçenekleri","show_links":"Bu konunun içindeki bağlantıları göster. ","toggle_information":"konu ayrıntılarını aç/kapa","read_more_in_category":"Daha fazlası için {{catLink}} kategorisine göz atabilir ya da  {{latestLink}}yebilirsiniz.","read_more":"Daha fazla okumak mı istiyorsunuz? {{catLink}} ya da {{latestLink}}.","browse_all_categories":"Bütün kategorilere göz at","view_latest_topics":"en son konuları görüntüle","suggest_create_topic":"Konu oluşturmaya ne dersiniz?","jump_reply_up":"Daha önceki cevaba geç","jump_reply_down":"Daha sonraki cevaba geç","deleted":"Konu silindi ","auto_close_notice":"Bu konu otomatik olarak kapanacak %{timeLeft}.","auto_close_notice_based_on_last_post":"Bu konu son cevaptan %{duration} sonra kapanacak.","auto_close_title":"Otomatik Kapatma Ayarları","auto_close_save":"Kaydet","auto_close_remove":"Bu Konuyu Otomatik Olarak Kapatma","progress":{"title":"konu gidişatı","go_top":"en üst","go_bottom":"en alt","go":"git","jump_bottom":"son gönderiye geç","jump_bottom_with_number":"%{post_number} numaralı gönderiye geç","total":"tüm gönderiler","current":"şu anki gönderi","position":"%{total} gönderi arasından %{current}."},"notifications":{"reasons":{"3_6":"Bu kategoriyi gözlediğiniz için bildirimlerini alacaksınız.","3_5":"Bu konuyu otomatik olarak gözlemeye başladığınız için bildirimlerini alacaksınız.","3_2":"Bu konuyu gözlediğiniz için bildirimlerini alacaksınız.","3_1":"Bu konuyu siz oluşturduğunuz için bildirimlerini alacaksınız.","3":"Bu konuyu gözlediğiniz için bildirimlerini alacaksınız.","2_8":"Be kategoriyi takip ettiğiniz için bildirimlerini alacaksınız.","2_4":"Bu konuya cevap yazdığınız için bildirimlerini alacaksınız.","2_2":"Bu konuyu takip ettiğiniz için bildirimlerini alacaksınız.","2":"\u003ca href=\"/users/{{username}}/preferences\"\u003eBu konuyu okuduğunuz için\u003c/a\u003e bildirimlerini alacaksınız.","1_2":"Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız.","1":"Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız.","0_7":"Bu kategoriye ait tüm bildirimleri görmezden geliyorsunuz.","0_2":"Bu konuya ait tüm bildirimleri görmezden geliyorsunuz.","0":"Bu konuya ait tüm bildirimleri görmezden geliyorsunuz."},"watching_pm":{"title":"Gözleniyor","description":"Bu mesajlaşmada ki her yeni gönderi için bir bildirim alacaksınız. Okunmamış ve yeni gönderilerin sayısı konunun yanında belirecek."},"watching":{"title":"Gözleniyor","description":"Bu konudaki her yeni gönderi için bir bildirim alacaksınız. Okunmamış ve yeni gönderilerin sayısı konunun yanında belirecek."},"tracking_pm":{"title":"Takip Ediliyor","description":"Okunmamış ve yeni gönderi sayısı mesajın yanında belirecek. Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız."},"tracking":{"title":"Takip Ediliyor","description":"Okunmamış ve yeni gönderi sayısı başlığın yanında belirecek. Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız."},"regular":{"title":"Olağan","description":"Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız."},"regular_pm":{"title":"Olağan","description":"Birisi @isim şeklinde sizden bahsederse ya da gönderinize mesajla cevap verirse bildirim alacaksınız."},"muted_pm":{"title":"Susturuldu","description":"Bu mesajlaşmayla ilgili hiç bir bildirim almayacaksınız."},"muted":{"title":"Susturuldu","description":"Bu konu en son gönderilerde belirmeyecek, ve hakkında hiçbir bildirim almayacaksınız."}},"actions":{"recover":"Konuyu Geri Getir","delete":"Konuyu Sil","open":"Konuyu Aç","close":"Konuyu Kapat","multi_select":"Gönderileri Seç...","auto_close":"Otomatik Kapat...","pin":"Başa Tuttur...","unpin":"Baştan Kaldır...","unarchive":"Konuyu Arşivden Kaldır","archive":"Konuyu Arşivle","invisible":"Gizle","visible":"Görünür Yap","reset_read":"Görüntüleme Verilerini Sıfırla"},"feature":{"pin":"Başa Tuttur","unpin":"Baştan Kaldır","pin_globally":"Her Yerde Başa Tuttur","make_banner":"Manşet Konusu","remove_banner":"Manşet Konusunu Kaldır"},"reply":{"title":"Cevapla","help":"bu konuya bir cevap oluşturmaya başlayın"},"clear_pin":{"title":"Başa tutturmayı iptal et","help":"Bu konunun başa tutturulması iptal edilsin ki artık konu listenizin en üstünde gözükmesin"},"share":{"title":"Paylaş","help":"bu konunun bağlantısını paylaşın"},"flag_topic":{"title":"Bayrakla","help":"bu gönderiyi kontrol edilmesi için özel olarak bayraklayın ya da bununla ilgili özel bir bildirim yollayın","success_message":"Bu konuyu başarıyla bayrakladınız."},"feature_topic":{"title":"Bu konuyu ön plana çıkar","pin":"Şu zamana kadar bu konunun {{categoryLink}} kategorisinin başında görünmesini sağla","confirm_pin":"Zaten başa tutturulan {{count}} konunuz var. Çok fazla konuyu başa tutturmak yeni ve anonim kullanıcılara sıkıntı çektirebilir. Bu kategoride bir konuyu başa tutturmak istediğinize emin misiniz?","unpin":"Bu konuyu {{categoryLink}} kategorisinin en üstünden kaldır.","unpin_until":"Bu konuyu {{categoryLink}} kategorisinin başından kaldır ya da şu zamana kadar bekle: \u003cstrong\u003e%{until}\u003c/strong\u003e.","pin_note":"Kullanıcılar kendileri için konunun başa tutturulmasını kaldırabilir.","pin_validation":"Bu konuyu sabitlemek için bir tarih gerekli.","not_pinned":" {{categoryLink}} kategorisinde başa tutturulan herhangi bir konu yok.","already_pinned":{"other":"Şu an {{categoryLink}} kategorisinde başa tutturulan konular: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e."},"pin_globally":"Şu zamana kadar bu konunun bütün konu listelerinin başında yer almasını sağla","confirm_pin_globally":"Zaten her yerde başa tutturulan {{count}} konunuz var. Çok fazla konuyu başa tutturmak yeni ve anonim kullanıcılara sıkıntı çektirebilir. Bir konuyu daha her yerde başa tutturmak istediğinizden emin misiniz?","unpin_globally":"Bu konuyu tüm konu listelerinin en üstünden kaldır.","unpin_globally_until":"Bu konuyu bütün konu listelerinin başından kaldır ya da şu zamana kadar bekle: \u003cstrong\u003e%{until}\u003c/strong\u003e.","global_pin_note":"Kullanıcılar kendileri için konunun başa tutturulmasını kaldırabilir.","not_pinned_globally":"Her yerde başa tutturulan herhangi bir konu yok.","already_pinned_globally":{"other":"Şu an her yerde başa tutturulan konular: \u003cstrong class='badge badge-notification unread'\u003e{{count}}\u003c/strong\u003e."},"make_banner":"Bu konuyu tüm sayfaların en üstünde görünecek şekilde manşetleştir.","remove_banner":"Tüm sayfaların en üstünde görünen manşeti kaldır.","banner_note":"Kullanıcılar bu manşeti kapatarak yoksayabilirler. Herhangi bir zamanda sadece bir konu manşetlenebilir.","no_banner_exists":"Manşet konusu yok.","banner_exists":"Şu an bir manşet konusu \u003cstrong class='badge badge-notification unread'\u003evar\u003c/strong\u003e."},"inviting":"Davet Ediliyor...","automatically_add_to_groups_optional":"Bu davet şu gruplara erişimi de içerir: (opsiyonel, sadece yöneticiler için)","automatically_add_to_groups_required":"Bu davet şu gruplara erişimi de içerir: (\u003cb\u003eGerekli\u003c/b\u003e, sadece yöneticiler için)","invite_private":{"title":"Mesajlaşmaya Davet Et","email_or_username":"Davet edilenin e-postası ya da kullanıcı adı","email_or_username_placeholder":"e-posta ya da kullanıcı adı","action":"Davet et","success":"O kullanıcıyı bu mesajlaşmaya davet ettik.","error":"Üzgünüz, kullanıcı davet edilirken bir hata oluştu.","group_name":"grup adı"},"invite_reply":{"title":"Davet Et","username_placeholder":"kullanıcıadı","action":"Davet Gönder","help":"e-posta veya bildiri aracılığıyla başkalarını bu konuya davet edin","to_forum":"Arkadaşınıza, oturum açması gerekmeden, bir bağlantıya tıklayarak katılabilmesi için kısa bir e-posta göndereceğiz. ","sso_enabled":"Bu konuya davet etmek istediğiniz kişinin kullanıcı adını girin.","to_topic_blank":"Bu konuya davet etmek istediğiniz kişinin kullanıcı adını veya e-posta adresini girin.","to_topic_email":"Bir email adresi girdiniz. Arkadaşınızın konuya hemen cevap verebilmesini sağlayacak bir davetiye e-postalayacağız.","to_topic_username":"Bir kullanıcı adı girdiniz. Kullanıcıya, bu konuya davet bağlantısı içeren bir bildiri yollayacağız.","to_username":"Davet etmek istediğiniz kişinin kullanıcı adını girin. Kullanıcıya, bu konuya davet bağlantısı içeren bir bildiri yollayacağız.","email_placeholder":"isim@örnek.com","success_email":"\u003cb\u003e{{emailOrUsername}}\u003c/b\u003e kullanıcısına davet e-postalandı. Davet kabul edildiğinde size bir bildiri göndereceğiz. Davetlerinizi takip etmek için kullanıcı sayfanızdaki davetler sekmesine göz atın.","success_username":"Kullanıcıyı bu konuya katılması için davet ettik.","error":"Üzgünüz, kullanıcıyı davet edemedik. Zaten davet edilmiş olabilir mi? (Davetler oran sınırlarına tabiidir.)"},"login_reply":"Cevaplamak için oturum açın","filters":{"n_posts":{"other":"{{count}} gönderi"},"cancel":"Filteri kaldır"},"split_topic":{"title":"Yeni Konuya Geç","action":"yeni konuya geç","topic_name":"Yeni Konu Adı","error":"Gönderiler yeni konuya taşınırken bir hata oluştu.","instructions":{"other":"Yeni bir konu oluşturmak ve bu konuyu seçtiğiniz \u003cb\u003e{{count}}\u003c/b\u003e gönderi ile doldurmak üzeresiniz."}},"merge_topic":{"title":"Var Olan Bir Konuya Taşı","action":"var olan bir konuya taşı","error":"Gönderiler konuya aşınırken bir hata oluştu.","instructions":{"other":"Lütfen bu \u003cb\u003e{{count}}\u003c/b\u003e gönderiyi taşımak istediğiniz konuyu seçin. "}},"change_owner":{"title":"Gönderilerin Sahibini Değiştir","action":"sahipliğini değiştir","error":"Gönderilerin sahipliği değiştirilirken bir hata oluştu.","label":"Gönderilerin Yeni Sahibi","placeholder":"yeni sahibin kullanıcı adı","instructions":{"other":"Lütfen \u003cb\u003e{{old_user}}\u003c/b\u003e kullanıcısına ait {{count}} gönderinin yeni sahibini seçin."},"instructions_warn":"Bu gönderi ile ilgili geriye dönük biriken bildirimler yeni kullanıcıya aktarılmayacak.\u003cbr\u003eUyarı: Şu an, yeni kullanıcıya hiç bir gönderi-tabanlı ek bilgi aktarılmıyor. Dikkatli olun."},"change_timestamp":{"title":"Değişiklik Zaman Bilgisi","action":"değişiklik zaman bilgisi","invalid_timestamp":"Zaman bilgisi gelecekte olamaz.","error":"Konunun zaman bilgisini değiştirirken bir hata oluştu.","instructions":"Lütfen konunun yeni zaman bilgisini seçiniz. Konudaki gönderiler aynı zaman farkına sahip olmaları için güncellenecekler."},"multi_select":{"select":"seç","selected":"({{count}}) seçildi","select_replies":"cevaplarıyla seç","delete":"seçilenleri sil","cancel":"seçimi iptal et","select_all":"hepsini seç","deselect_all":"tüm seçimi kaldır","description":{"other":"\u003cb\u003e{{count}}\u003c/b\u003e gönderi seçtiniz."}}},"post":{"reply":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{replyAvatar}} {{usernameLink}}","reply_topic":"\u003ci class='fa fa-mail-forward'\u003e\u003c/i\u003e {{link}}","quote_reply":"alıntıyla cevapla","edit":"{{link}} {{replyAvatar}} {{username}} düzenleniyor","edit_reason":"Neden: ","post_number":"gönderi {{number}}","last_edited_on":"gönderinin en son düzenlenme tarihi","reply_as_new_topic":"Bağlantılı Konu Olarak Cevapla","continue_discussion":"{{postLink}} Gönderisinden tartışmaya devam ediliyor:","follow_quote":"alıntılanan mesaja git","show_full":"Gönderinin Tamamını Göster","show_hidden":"Gizlenmiş içeriği görüntüle.","deleted_by_author":{"other":"(yazarı tarafından geri alınan gönderi,  bayraklanmadığı takdirde %{count} saat içinde otomatik olarak silinecek.)"},"expand_collapse":"aç/kapat","gap":{"other":"gizlenen {{count}} yorumu gör"},"more_links":"{{count}} tane daha...","unread":"Gönderi okunmamış","has_replies":{"other":"{{count}} Yanıt"},"has_likes":{"other":"{{count}} Beğeni"},"has_likes_title":{"other":"{{count}} kişi bu gönderiyi beğendi"},"has_likes_title_only_you":"bu gönderiyi beğendiniz","has_likes_title_you":{"other":"siz ve {{count}} diğer kişi bu gönderiyi beğendi"},"errors":{"create":"Üzgünüz, gönderiniz oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.","edit":"Üzgünüz, gönderiniz düzenlenirken bir hata oluştu. Lütfen tekrar deneyin. ","upload":"Üzgünüz, dosya yüklenirken bir hata oluştu. Lütfen tekrar deneyin.","attachment_too_large":"Üzgünüz, yükleyeme çalıştığınız dosya çok büyük (en fazla {{max_size_kb}}kb olabilir)","file_too_large":"Üzgünüz, yüklemeye çalıştığınız dosya çok büyük. (en fazla boyut {{max_size_kb}}kb)","too_many_uploads":"Üzgünüz, aynı anda birden fazla dosya yükleyemezsiniz.","too_many_dragged_and_dropped_files":"Üzgünüz, sürükle bırak ile tek seferde en fazla 10 dosya yükleyebilirsiniz","upload_not_authorized":"Üzgünüz, yüklemeye çalıştığınız dosya tipine izin verilmiyor. (izin verilen uzantılar: {{authorized_extensions}}).","image_upload_not_allowed_for_new_user":"Üzgünüz, yeni kullanıcılar resim yükleyemiyorlar.","attachment_upload_not_allowed_for_new_user":"Üzgünüz, yeni kullanıcılar dosya ekleyemiyorlar.","attachment_download_requires_login":"Üzgünüz, eklentileri indirebilmek için oturum açmanız gerekiyor."},"abandon":{"confirm":"Gönderinizden vazgeçtiğinize emin misiniz?","no_value":"Hayır, kalsın","yes_value":"Evet, vazgeç"},"via_email":"bu gönderi e-posta ile iletildi","whisper":"bu gönderi yöneticiler için özel bir fısıltıdır","wiki":{"about":"bu gönderi bir wiki; acemi kullanıcılar düzenleyebilir"},"archetypes":{"save":"Seçenekleri kaydet"},"controls":{"reply":"bu gönderiye bir cevap oluşturmaya başlayın","like":"bu gönderiyi beğen","has_liked":"bu gönderiyi beğendiniz","undo_like":"beğenmekten vazgeç","edit":"bu gönderiyi düzenle","edit_anonymous":"Üzgünüz, ama bu gönderiyi düzenleyebilmek için oturum açmalısınız.","flag":"bu gönderiyi kontrol edilmesi için özel olarak bayraklayın ya da bununla ilgili özel bir bildirim yollayın","delete":"bu gönderiyi sil","undelete":"bu gönderinin silinmesini geri al","share":"bu gönderinin bağlantısını paylaşın","more":"Daha fazla","delete_replies":{"confirm":{"other":"Bu gönderiye verilen {{count}} direk cevabı da silmek istiyor musunuz?"},"yes_value":"Evet, cevapları da sil","no_value":"Hayır, sadece bu gönderiyi"},"admin":"gönderiyle alakalı yönetici işlemleri","wiki":"Wiki Yap","unwiki":"Wiki'yi Kaldır","convert_to_moderator":"Görevli Rengi Ekle","revert_to_regular":"Görevli Rengini Kaldır","rebake":"HTML'i Yeniden Yapılandır","unhide":"Gizleme","change_owner":"sahipliğini değiştir"},"actions":{"flag":"Bayrakla","defer_flags":{"other":"Bayrağı ertele"},"it_too":{"off_topic":"Bir de bayrakla","spam":"Bir de rapor et","inappropriate":"Bir de rapor et","custom_flag":"Bir de bayrakla","bookmark":"Bir de işaretle","like":"Sen de beğen","vote":"Bir de oyla"},"undo":{"off_topic":"Bayrağı geri al","spam":"Bayrağı geri al","inappropriate":"Bayrağı geri al","bookmark":"İşareti geri al","like":"Beğenini geri al","vote":"Oyunu geri al"},"people":{"off_topic":"{{icons}} konu dışı olarak bayrakladı","spam":"{{icons}} spam olarak bayrakladı","spam_with_url":"{{icons}} bu linki \u003ca href='{{postUrl}}'\u003espam olarak bayrakladı\u003c/a\u003e","inappropriate":"{{icons}} uygunsuz olarak bayrakladı","notify_moderators":"{{icons}} bildirim gönderilen moderatörler","notify_moderators_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003ebildirim gönderilen moderatörler\u003c/a\u003e","notify_user":"{{icons}} mesaj yolladı","notify_user_with_url":"{{icons}} \u003ca href='{{postUrl}}'\u003emesaj\u003c/a\u003e yolladı","bookmark":"{{icons}} bunu işaretledi","like":"{{icons}} bunu beğendi","vote":"{{icons}} bunun için oyladı"},"by_you":{"off_topic":"Bunu konu dışı olarak bayrakladınız","spam":"Bunu spam olarak bayrakladınız","inappropriate":"Bunu uygunsuz olarak bayrakladınız","notify_moderators":"Bunu moderasyon için bayrakladınız","notify_user":"Bu kullanıcıya mesaj yolladınız","bookmark":"Bu gönderiyi işaretlediniz","like":"Bunu beğendiniz","vote":"Bu gönderiyi oyladınız"},"by_you_and_others":{"off_topic":{"other":"Siz ve {{count}} diğer kişi bunu konu dışı olarak bayrakladı"},"spam":{"other":"Siz ve {{count}} diğer kişi bunu spam olarak bayrakladı"},"inappropriate":{"other":"Siz ve {{count}} diğer kişi bunu uygunsuz olarak bayrakladı"},"notify_moderators":{"other":"Siz ve {{count}} diğer kişi bunu denetlenmesi için bayrakladı"},"notify_user":{"other":"Siz ve {{count}} diğer kişi bu kullanıcıya mesaj yolladı"},"bookmark":{"other":"Siz ve {{count}} diğer kişi bu gönderiyi işaretledi"},"like":{"other":"Siz ve {{count}} başka kişi bunu beğendi"},"vote":{"other":"Siz ve {{count}} kişi bu gönderiyi oyladı"}},"by_others":{"off_topic":{"other":"{{count}} kişi bunu konu dışı olarak bayrakladı"},"spam":{"other":"{{count}} kişi bunu spam olarak bayrakladı"},"inappropriate":{"other":"{{count}} kişi bunu uygunsuz olarak bayrakladı"},"notify_moderators":{"other":"{{count}} kişi bunu moderasyon için bayrakladı"},"notify_user":{"other":"{{count}} bu kullanıcıya mesaj yolladı"},"bookmark":{"other":"{{count}} kişi bu gönderiyi işaretledi"},"like":{"other":"{{count}} kişi bunu beğendi"},"vote":{"other":"{{count}} kişi bu gönderiyi oyladı"}}},"delete":{"confirm":{"other":"Tüm bu gönderileri silmek istediğinize emin misiniz?"}},"revisions":{"controls":{"first":"İlk revizyon","previous":"Önceki revizyon","next":"Sonraki revizyon","last":"Son revizyon","hide":"Düzenlemeyi gizle","show":"Düzenlemeyi göster","comparing_previous_to_current_out_of_total":"\u003cstrong\u003e{{previous}}\u003c/strong\u003e \u003ci class='fa fa-arrows-h'\u003e\u003c/i\u003e \u003cstrong\u003e{{current}}\u003c/strong\u003e / {{total}}"},"displays":{"inline":{"title":"İşlenmiş çıktıyı ekleme ve çıkarmalarla birlikte göster","button":"\u003ci class=\"fa fa-square-o\"\u003e\u003c/i\u003e HTML"},"side_by_side":{"title":"İşlenmiş diff çıktılarını yan yana göster","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e HTML"},"side_by_side_markdown":{"title":"İşlenmemiş diff kaynaklarını yan yana göster","button":"\u003ci class=\"fa fa-columns\"\u003e\u003c/i\u003e Raw"}}}},"category":{"can":"yapabilir\u0026hellip;","none":"(kategori yok)","all":"Tüm kategoriler","choose":"Kategori seç\u0026hellip;","edit":"düzenle","edit_long":"Düzenle","view":"Bu Kategorideki Konuları Görüntüle","general":"Genel","settings":"Ayarlar","topic_template":"Konu Şablonu","delete":"Kategoriyi Sil","create":"Yeni Kategori","create_long":"Yeni bir kategori oluştur","save":"Kategoriyi Kaydet","slug":"Kategori Kalıcı Bağlantısı","slug_placeholder":"(Opsiyonel) bağlantı için tire ile ayırılmış kelimeler","creation_error":"Kategori oluşturulurken hata oluştu.","save_error":"Kategori kaydedilirken hata oluştu.","name":"Kategori Adı","description":"Açıklama","topic":"kategori konusu","logo":"Kategori Logosu Görseli","background_image":"Kategori Arka Planı Görseli","badge_colors":"Rozet renkleri","background_color":"Arka plan rengi","foreground_color":"Ön plan rengi","name_placeholder":"En fazla bir ya da iki kelime","color_placeholder":"Herhangi bir web rengi","delete_confirm":"Bu kategoriyi silmek istediğinize emin misiniz?","delete_error":"Kategoriyi silinirken bir hata oluştu.","list":"Kategorileri Listele","no_description":"Lütfen bu kategori için bir açıklama girin.","change_in_category_topic":"Açıklamayı Düzenle","already_used":"Bu renk başka bir kategori için kullanıldı","security":"Güvenlik","special_warning":"Uyarı: Bu kategori önceden ayarlanmış bir kategoridir ve güvenlik ayarları değiştirilemez. Eğer bu kategoriyi kullanmak istemiyorsanız, başka bir amaçla kullanmak yerine silin.","images":"Resimler","auto_close_label":"Şu kadar süreden sonra konuları otomatik olarak kapat: ","auto_close_units":"saat","email_in":"Özel gelen e-posta adresi:","email_in_allow_strangers":"Hesabı olmayan, anonim kullanıcılardan e-posta kabul et","email_in_disabled":"E-posta üzerinden yeni konu oluşturma özelliği Site Ayarları'nda devre dışı bırakılmış. E-posta üzerinden yeni konu oluşturma özelliğini etkinleştirmek için,","email_in_disabled_click":"\"e-postala\" ayarını etkinleştir","contains_messages":"Kategoriyi sadece mesajları kapsayacak şekilde değiştir.","suppress_from_homepage":"Bu kategoriyi ana sayfadan gizle","allow_badges_label":"Bu kategoride rozet verilmesine izin ver","edit_permissions":"İzinleri Düzenle","add_permission":"İzin Ekle","this_year":"bu yıl","position":"pozisyon","default_position":"Varsayılan Pozisyon","position_disabled":"Kategoriler etkinlik sıralarına göre görünecekler. Listelerdeki kategorilerin sıralamalarını kontrol edebilmek için,","position_disabled_click":"\"sabitlenmiş kategori pozisyonları\" ayarını etklinleştirin.","parent":"Üst Kategori","notifications":{"watching":{"title":"Gözleniyor","description":"Bu kategorilerdeki tüm yeni konuları otomatik olarak gözleyeceksiniz. Tüm yeni gönderi ve konular size bildirilecek. Ayrıca, okunmamış ve yeni gönderilerin sayısı ilgili konunun yanında belirecek."},"tracking":{"title":"Takip Ediliyor","description":"Bu kategorilerdeki tüm yeni konuları otomatik olarak gözleyeceksiniz. Biri @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız. Ayrıca, okunmamış ve yeni cevapların sayısı ilgili konunun yanında belirecek."},"regular":{"title":"Normal","description":"Birisi @isim şeklinde sizden bahsederse ya da gönderinize cevap verirse bildirim alacaksınız."},"muted":{"title":"Susturuldu","description":"Bu kategorilerdeki yeni konular hakkında herhangi bir bildiri almayacaksınız ve en son gönderilerde belirmeyecekler. "}}},"flagging":{"title":"Topluluğumuzun medeni kalmasına yardımcı olduğunuz için teşekkürler!","private_reminder":"bayraklar özeldir, \u003cb\u003esadece\u003c/b\u003e görevlilere gözükür","action":"Gönderiyi Bayrakla","take_action":"Harekete Geç","notify_action":"Mesaj","delete_spammer":"Spamcıyı Sil","delete_confirm":"Bu kullanıcının \u003cb\u003e%{posts}\u003c/b\u003e gönderisini ve \u003cb\u003e%{topics}\u003c/b\u003e konusunu silmek, hesabını kapatmak, kullandığı IP Adresi \u003cb\u003e%{ip_address}\u003c/b\u003e üzerinden hesap açılmasını engellemek, ve  \u003cb\u003e%{email}\u003c/b\u003e e-posta adresini kalıcı engellenenler listesine eklemek üzeresiniz. Bu kullanıcının gerçekten spamci olduğuna emin misiniz?","yes_delete_spammer":"Evet, spamcıyı sil","ip_address_missing":"(uygulanamaz)","hidden_email_address":"(gizli)","submit_tooltip":"Özel bayrağı gönder","take_action_tooltip":"Topluluğunuzdan daha fazla bayrak beklemek yerine bunu siz hızlıca yaparak eşiğe erişebilirsiniz","cant":"Üzgünüz, şu an bu gönderiyi bayraklayamazsınız.","notify_staff":"Yöneticilere İlet","formatted_name":{"off_topic":"Konu Dışı","inappropriate":"Uygunsuz","spam":"Spam"},"custom_placeholder_notify_user":"Açıklayıcı, yapıcı ve her zaman nazik olun.","custom_placeholder_notify_moderators":"Sizi neyin endişelendirdiğini açıklayıcı bir dille bize bildirin ve mümkün olan yerlerde konu ile alakalı bağlantıları paylaşın.","custom_message":{"at_least":"en az {{n}} karakter girin","more":"{{n}} tane daha var..","left":"{{n}} kaldı"}},"flagging_topic":{"title":"Topluluğumuzun medeni kalmasına yardımcı olduğunuz için teşekkürler!","action":"Konuyu Bayrakla","notify_action":"Mesaj"},"topic_map":{"title":"Konu Özeti","participants_title":"Sıkça Yazanlar","links_title":"Popüler bağlantılar","links_shown":"tüm {{totalLinks}} bağlantıları göster...","clicks":{"other":"%{count} tıklama"}},"topic_statuses":{"warning":{"help":"Bu resmi bir uyarıdır."},"bookmarked":{"help":"Bu konuyu işaretlediniz"},"locked":{"help":"Bu konu kapatıldı; artık yeni cevaplar kabul edilmiyor"},"archived":{"help":"Bu başlık arşive kaldırıldı; donduruldu ve değiştirilemez"},"locked_and_archived":{"help":"Bu konu kapatıldı ve arşivlendi; yeni cevaplar kabul edemez ve değiştirilemez."},"unpinned":{"title":"Başa tutturma kaldırıldı","help":"Bu konu sizin için başa tutturulmuyor; normal sıralama içerisinde görünecek"},"pinned_globally":{"title":"Her Yerde Başa Tutturuldu","help":"Bu konu her yerde başa tutturuldu; gönderildiği kategori ve en son gönderilerin en üstünde görünecek"},"pinned":{"title":"Başa Tutturuldu","help":"Bu konu sizin için başa tutturuldu; kendi kategorisinin en üstünde görünecek"},"invisible":{"help":"Bu konu gizli; konu listelerinde görünmeyecek, ve sadece doğrudan bağlantı aracılığıyla erişilebilecek"}},"posts":"Gönderi","posts_lowercase":"gönderi","posts_long":"bu konuda {{number}} gönderi var","original_post":"Orijinal Gönderi","views":"Gösterim","views_lowercase":{"other":"gösterim"},"replies":"Cevap","views_long":"bu konu {{number}} defa görüntülendi","activity":"Aktivite","likes":"Beğeni","likes_lowercase":{"other":"beğeni"},"likes_long":"bu konuda {{number}} beğeni var","users":"Kullanıcı","users_lowercase":{"other":"kullanıcı"},"category_title":"Kategori","history":"Geçmiş","changed_by":"Yazan {{author}}","raw_email":{"title":"Ham e-posta","not_available":"Müsait değil!"},"categories_list":"Kategori Listesi","filters":{"with_topics":"%{filter} konular","with_category":"%{filter} %{category} konular","latest":{"title":"En son","title_with_count":{"other":"En Son ({{count}})"},"help":"yakın zamanda gönderi alan konular"},"hot":{"title":"Sıcak","help":"en sıcak konulardan bir derleme"},"read":{"title":"Okunmuş","help":"okuduğunuz başlıklar, okunma sırasına göre"},"search":{"title":"Arama","help":"tüm konularda ara"},"categories":{"title":"Kategoriler","title_in":"Kategori - {{categoryName}}","help":"kategori bazında tüm konular"},"unread":{"title":"Okunmamış","title_with_count":{"other":"Okunmamış ({{count}})"},"help":"okunmamış gönderiler bulunan gözlediğiniz ya da takip ettiğiniz konular","lower_title_with_count":{"other":"{{count}} okunmamış"}},"new":{"lower_title_with_count":{"other":"{{count}} yeni"},"lower_title":"yeni","title":"Yeni","title_with_count":{"other":"Yeni ({{count}}) "},"help":"son birkaç günde oluşturulmuş konular"},"posted":{"title":"Gönderilerim","help":"gönderi oluşturduğunuz konular"},"bookmarks":{"title":"İşaretlenenler","help":"işaretlediğiniz konular"},"category":{"title":"{{categoryName}}","title_with_count":{"other":"{{categoryName}} ({{count}})"},"help":"{{categoryName}} kategorisindeki en son konular"},"top":{"title":"En Popüler","help":"geçtiğimiz yıl, ay, hafta veya gündeki en etkin başlıklar","all":{"title":"Tüm Zamanlar"},"yearly":{"title":"Yıllık"},"quarterly":{"title":"Üç aylık"},"monthly":{"title":"Aylı"},"weekly":{"title":"Haftalık"},"daily":{"title":"Günlük"},"all_time":"Tüm Zamanlar","this_year":"Yıl","this_quarter":"Çeyrek","this_month":"Ay","this_week":"Hafta","today":"Bugün","other_periods":"yukarı bak"}},"browser_update":"Malesef,  \u003ca href=\"http://www.discourse.org/faq/#browser\"\u003etarayıcınız bu site için çok eski\u003c/a\u003e. Lütfen \u003ca href=\"http://browsehappy.com\"\u003etarayıcınızı güncelleyin\u003c/a\u003e.","permission_types":{"full":"Oluştur / Cevapla / Bak","create_post":"Cevapla / Bak","readonly":"Bak"},"poll":{"voters":{"other":"oylayan"},"total_votes":{"other":"toplam oy"},"average_rating":"Ortalama oran: \u003cstrong\u003e%{average}\u003c/strong\u003e.","multiple":{"help":{"at_least_min_options":{"other":"En az \u003cstrong\u003e%{count}\u003c/strong\u003e seçim yapmalısınız."},"up_to_max_options":{"other":"En fazla \u003cstrong\u003e%{count}\u003c/strong\u003e seçim yapabilirsiniz."},"x_options":{"other":"\u003cstrong\u003e%{count}\u003c/strong\u003e seçim yapmalısınız."},"between_min_and_max_options":"\u003cstrong\u003e%{min}\u003c/strong\u003e ve \u003cstrong\u003e%{max}\u003c/strong\u003e seçenekleri arasında seçim yapabilirsiniz."}},"cast-votes":{"title":"Oyunuzu kullanın","label":"Şimdi oylayın!"},"show-results":{"title":"Anket sonuçlarını göster","label":"Sonuçları göster"},"hide-results":{"title":"Oylarınıza dönün","label":"Sonuçları gizle"},"open":{"title":"Anketi başlat","label":"Başlat","confirm":"Bu anketi başlatmak istediğinize emin misiniz?"},"close":{"title":"Anketi bitir","label":"Bitir","confirm":"Bu anketi bitirmek istediğinize emin misiniz?"},"error_while_toggling_status":"Bu anketin statüsü değiştirilirken bir hata oluştu.","error_while_casting_votes":"Oylama esnasında hata oluştu."},"type_to_filter":"filtre girin...","admin":{"title":"Discourse Yönetici Paneli","moderator":"Moderatör","dashboard":{"title":"Yönetici Paneli","last_updated":"Yönetici panelinin son güncellenmesi:","version":"Versiyon","up_to_date":"Sisteminiz güncel durumda!","critical_available":"Önemli bir güncelleme var.","updates_available":"Yeni güncellemeler var.","please_upgrade":"Lütfen güncelleyin!","no_check_performed":"Güncelleme kontrolü gerçekleşmedi, lütfen sidekiq'in çalışır durumda olduğundan emin olun.","stale_data":"Güncelleme kontrolü bir süredir gerçekleşmiyor, lütfen sidekiq'in çalışır durumda olduğundan emin olun.","version_check_pending":"Sanırım yeni güncelleme yaptınız. Harika!","installed_version":"Yüklendi","latest_version":"En son","problems_found":"Discourse kurulumuyla ilgili bazı sorunlar bulundu: ","last_checked":"Son kontrol","refresh_problems":"Yenile","no_problems":"Herhangi bir sorun bulunamadı.","moderators":"Moderatörler:","admins":"Yöneticiler:","blocked":"Engellenmiş:","suspended":"Uzaklaştırılmışlar:","private_messages_short":"Mesajlar","private_messages_title":"Mesajlar","mobile_title":"Mobil","space_free":"{{size}} serbest","uploads":"yüklemeler","backups":"Yedekler","traffic_short":"Trafik","traffic":"Uygulama web istekleri","page_views":"API istekleri","page_views_short":"API istekleri","show_traffic_report":"Detaylı Trafik Raporunu Görüntüle","reports":{"today":"Bugün","yesterday":"Dün","last_7_days":"Son 7 Gün","last_30_days":"Son 30 Gün","all_time":"Tüm Zamanlar","7_days_ago":"7 Gün Önce","30_days_ago":"30 Gün Önce","all":"Hepsi","view_table":"tablo","view_chart":"sütunlu grafik","refresh_report":"Raporu Yenile","start_date":"Başlangıç tarihi","end_date":"Bitiş Tarihi"}},"commits":{"latest_changes":"En son değişiklikler: lütfen sık güncelleyin!","by":"tarafından"},"flags":{"title":"Bayraklar","old":"Eski","active":"Etkin","agree":"Onayla","agree_title":"Bu bayrağı geçerli ve doğru olarak onayla","agree_flag_modal_title":"Onayla ve...","agree_flag_hide_post":"Onayla (gönderiyi gizle + özel mesaj yolla)","agree_flag_hide_post_title":"Bu gönderiyi gizle ve otomatik olarak kullanıcıya acilen düzenleme yapmasını belirten bir mesaj gönder","agree_flag_restore_post":"Kabul ediyorum (gönderiyi geri getir)","agree_flag_restore_post_title":"Gönderiyi geri getir","agree_flag":"Bayrağı onayla","agree_flag_title":"Bayrağı onayla ve gönderide değişiklik yapma","defer_flag":"Ertele","defer_flag_title":"Bu bayrağı kaldır; şu an için bir seçeneği uygulamak gerekmiyor.","delete":"Sil","delete_title":"Bu bayrağın ait olduğu gönderiyi sil.","delete_post_defer_flag":"Gönderiyi sil ve bayrağı ertele","delete_post_defer_flag_title":"Gönderiyi sil; başka gönderi yoksa, konuyu da sil.","delete_post_agree_flag":"Gönderiyi sil ve bayrağı onayla","delete_post_agree_flag_title":"Gönderiyi sil; başka gönderi yoksa, konuyu da sil.","delete_flag_modal_title":"Sil ve...","delete_spammer":"Spamcıyı Sil","delete_spammer_title":"Kullanıcıyı ve kullanıcıya ait tüm konu ve gönderileri kaldır. ","disagree_flag_unhide_post":"Onaylama (gönderiyi gizleme)","disagree_flag_unhide_post_title":"Bu gönderiye ait tüm bayrakları kaldır ve gönderiyi tekrar görünür hale getir","disagree_flag":"Onaylama","disagree_flag_title":"Bu bayrağı geçersiz ya da yanlış sayarak reddet","clear_topic_flags":"Tamam","clear_topic_flags_title":"Bu konu araştırıldı ve sorunlar çözüldü. Bayrakları kaldırmak için Tamam butonuna basın. ","more":"(daha fazla cevap...)","dispositions":{"agreed":"onaylandı","disagreed":"onaylanmadı","deferred":"ertelendi"},"flagged_by":"Bayraklayan","resolved_by":"Çözen","took_action":"İşlem uygulandı","system":"Sistem","error":"Bir şeyler ters gitti","reply_message":"Yanıtla","no_results":"Bayraklanan içerik yok.","topic_flagged":"Bu \u003cstrong\u003ekonu\u003c/strong\u003e bayraklandı.","visit_topic":"Aksiyon almak için konuyu ziyaret edin","was_edited":"İlk bayraktan edilmesinden sonra gönderi düzenlendi","previous_flags_count":"Bu gönderi daha önce {{count}} defa bayraklanmış.","summary":{"action_type_3":{"other":"konu dışı x{{count}}"},"action_type_4":{"other":"uygunsuz x{{count}}"},"action_type_6":{"other":"özel x{{count}}"},"action_type_7":{"other":"özel x{{count}}"},"action_type_8":{"other":"spam x{{count}}"}}},"groups":{"primary":"Ana Grup","no_primary":"(ana grup yok)","title":"Grup","edit":"Grupları Düzenle","refresh":"Yenile","new":"Yeni","selector_placeholder":"kullanıcı adı girin","name_placeholder":"Grup adı, kullanıcı adındaki gibi boşluksuz olmalı","about":"Grup üyeliğinizi ve isimleri burada düzenleyin","group_members":"Grup üyeleri","delete":"Sil","delete_confirm":"Grup silinsin mi?","delete_failed":"Grup silinemedi. Bu otomatik oluşturulmuş bir grup ise, yok edilemez.","delete_member_confirm":"'%{username}' adlı kullanıcıyı '%{group}' grubundan çıkart?","delete_owner_confirm":"'%{username}' için sahiplik imtiyazı kaldırılsın mı?","name":"Ad","add":"Ekle","add_members":"Üye ekle","custom":"Özel","bulk_complete":"Kullanıcılar gruba eklendi.","bulk":"Topluca Gruba Ekle","bulk_paste":"Kullanıcı adı yada eposta listesini yapıştırın, her satıra bir tane gelecek:","bulk_select":"(bir grup seçin)","automatic":"Otomatik","automatic_membership_email_domains":"Bu listedeki bir e-posta alan adıyla kaydolan kullanıcılar otomatik olarak bu gruba eklenecekler:","automatic_membership_retroactive":"Varolan kayıtlı kullanıcıları eklemek için aynı e-posta alan adı kuralını uygula","default_title":"Bu gruptaki tüm kullanıcılar için varsayılan başlık","primary_group":"Otomatik olarak ana grup yap","group_owners":"Sahipler","add_owners":"Sahiplik ekle"},"api":{"generate_master":"Ana API Anahtarı Üret","none":"Şu an etkin API anahtarı bulunmuyor.","user":"Kullanıcı","title":"API","key":"API Anahtarı","generate":"Oluştur","regenerate":"Tekrar Oluştur","revoke":"İptal Et","confirm_regen":"API anahtarını yenisi ile değiştirmek istediğinize emin misiniz?","confirm_revoke":"Anahtarı iptal etmek istediğinize emin misiniz?","info_html":"API anahtarınız JSON çağrıları kullanarak konu oluşturup güncelleyebilmenize olanak sağlayacaktır.","all_users":"Tüm Kullanıcılar","note_html":"Bu anahtarı \u003cstrong\u003egizli\u003c/strong\u003e tutun, anahtara sahip kullanıcılar her hangi bir kullanıcı adı altında istedikleri gönderiyi oluşturabilirler."},"plugins":{"title":"Eklentiler","installed":"Yüklü Eklentiler","name":"İsim","none_installed":"Yüklenmiş herhangi bir eklentiniz yok.","version":"Versiyon","enabled":"Etkinleştirildi mi?","is_enabled":"E","not_enabled":"H","change_settings":"Ayarları Değiştir","change_settings_short":"Ayarlar","howto":"Nasıl eklenti yükleyebilirim?"},"backups":{"title":"Yedekler","menu":{"backups":"Yedekler","logs":"Kayıtlar"},"none":"Yedek bulunmuyor.","read_only":{"enable":{"title":"Salt-okunur modunu etkinleştir","label":"Salt-okunur modu etkinleştir","confirm":"Salt-okunur modunu etkinleştirmek istediğinize emin misiniz?"},"disable":{"title":"Salt-okunur modunu devre dışı bırak","label":"Salt-okunur modu devre dışı bırak"}},"logs":{"none":"Henüz kayıt bulunmuyor..."},"columns":{"filename":"Dosya adı","size":"Boyut"},"upload":{"label":"Yedek Yükle","title":"Bu oluşuma bir yedekleme yükle","uploading":"Yükleniyor...","success":"'{{filename}}' başarıyla yüklendi.","error":"'{{filename}}': {{message}} yüklenirken bir hata oluştu"},"operations":{"is_running":"İşlem devam ediyor...","failed":"{{operation}} gerçekleşemedi. Lütfen kayıtları kontrol edin.","cancel":{"label":"İptal","title":"Devam eden işlemi iptal et","confirm":"Devam eden işlemi iptal etmek istediğinize emin misiniz?"},"backup":{"label":"Yedek Oluştur","title":"Yedek oluştur","confirm":"Yeni bir yedekleme başlatmak istiyor musunuz?","without_uploads":"Evet (dosya eklemeyin)"},"download":{"label":"İndir","title":"Yedeği indir"},"destroy":{"title":"Yedeği kaldır","confirm":"Bu yedeği yok etmek istediğinize emin misiniz?"},"restore":{"is_disabled":"Geri getirme site ayarlarında devredışı bırakılmış.","label":"Geri Yükle","title":"Yedeği geri getir","confirm":"Yedeği geri getirmek istediğinize emin misiniz?"},"rollback":{"label":"Geri al","title":"Veritabanını calışan son haline geri al.","confirm":"Veri tabanını  çalışan bir önceki versyonuna geri almak istediğinizden emin misiniz?"}}},"export_csv":{"user_archive_confirm":"Gönderilerinizi indirmek istediğinize emin misiniz ?","success":"Dışarı aktarma başlatıldı, işlem tamamlandığında mesajla bilgilendirileceksiniz.","failed":"Dışa aktarırken hata oluştu. Lütfen kayıtları kontrol edin.","rate_limit_error":"Gönderiler günde bir kez indirilebilir, lütfen yarın tekrar deneyin.","button_text":"Dışa aktar","button_title":{"user":"Tüm kullanıcı listesini CSV formatında dışa aktar.","staff_action":"Tüm görevli aksiyonları logunu CSV formatında dışa aktar.","screened_email":"Tüm taranmış e-postalar listesini CSV formatında dışa aktar.","screened_ip":"Tüm taranmış IPler listesini CSV formatında dışa aktar.","screened_url":"Tüm taranmış URLler listesini CSV formatında dışa aktar."}},"export_json":{"button_text":"Dışarı Aktar"},"invite":{"button_text":"Davetleri Gönder","button_title":"Davetleri Gönder"},"customize":{"title":"Özelleştir","long_title":"Site Özelleştirmeleri","css":"CSS","header":"Başlık","top":"En Kısım","footer":"Alt Kısım","embedded_css":"Gömülü CSS","head_tag":{"text":"\u003c/head\u003e","title":"\u003c/head\u003e etiketinden önce eklenecek HTML"},"body_tag":{"text":"\u003c/body\u003e","title":"\u003c/body\u003e etiketinden önce eklenecek HTML"},"override_default":"Standart stil sayfasını eklemeyin","enabled":"Etkinleştirildi mi?","preview":"önizleme","undo_preview":"önizlemeyi kaldır","rescue_preview":"varsayılan stil","explain_preview":"Websitesine bu özelleştirilmiş stil sayfası ile bak","explain_undo_preview":"Şu an etkin olan özelleştirilmiş stil sayfasına geri dön","explain_rescue_preview":"Websitesine varsayılan stil sayfası ile bak","save":"Kaydet","new":"Yeni","new_style":"Yeni Stil","import":"İçeri Aktar","import_title":"Bir dosya seçin ya da kopyalayıp yapıştırın","delete":"Sil","delete_confirm":"Bu özelleştirmeyi sil?","about":"Websitesindeki CSS stil sayfalarını ve HTML başlıklarını değiştir. Özelleştirme ekleyerek başla.","color":"Renk","opacity":"Opaklık","copy":"Kopyala","email_templates":{"title":"E-posta Şablonları","subject":"Konu","body":"İçerik","none_selected":"Düzenlemeye başlamak için içerik tipi seçin. ","revert":"Değişiklikleri Sıfırla","revert_confirm":"Değişiklikleri sıfırlamak istediğinize emin misiniz?"},"css_html":{"title":"CSS/HTML","long_title":"CSS ve HTML Özelleştirmeleri"},"colors":{"title":"Renkler","long_title":"Renk Düzenleri","about":"Websitesindeki renkleri CSS yazmadan değiştir. Renk düzeni ekleyerek başla.","new_name":"Yeni Renk Düzeni","copy_name_prefix":"Kopyası","delete_confirm":"Bu renk düzenini sil?","undo":"geri al","undo_title":" Son kayıt esnasında yapılan bu renkteki değişiklikleri geri al.","revert":"eski haline getir","revert_title":"Bu rengi Discourse'un varsayılan renk düzenine sıfırla.","primary":{"name":"birincil","description":"Çoğu yazı, ikon ve kenarların rengi."},"secondary":{"name":"ikincil","description":"Ana arkaplan ve bazı butonların yazı rengi."},"tertiary":{"name":"üçüncül","description":"Bağlantı, bazı buton, bildiri ve vurguların rengi."},"quaternary":{"name":"dördüncül","description":"Navigasyon bağlantıları."},"header_background":{"name":"başlık arkaplanı","description":"Websitesi'nin sayfa başlığının arkaplan rengi."},"header_primary":{"name":"birincil başlık","description":"Websitesi'nin sayfa başlığındaki yazı ve ikonlar."},"highlight":{"name":"vurgula","description":"Sayfada vurgulanmış ögelerin, gönderi ve konu gibi, arkaplan rengi."},"danger":{"name":"tehlike","description":"Gönderi ve konu silme gibi aksiyonlar için vurgulama rengi."},"success":{"name":"başarı","description":"Seçeneğin başarılı olduğunu göstermek için kullanılır."},"love":{"name":"sevgi","description":"Beğen butonunun rengi."},"wiki":{"name":"wiki","description":"wiki gönderilerinin arka plan rengi."}}},"email":{"title":"E-posta","settings":"Ayarlar","all":"Hepsi","sending_test":"Test e-postası gönderiliyor...","error":"\u003cb\u003eHATA\u003c/b\u003e - %{server_error}","test_error":"Test e-postasının gönderilmesinde sorun yaşandı. Lütfen e-posta ayarlarınızı tekrar kontrol edin, yer sağlayıcınızın e-posta bağlantılarını bloke etmediğinden emin olun, ve tekrar deneyin.","sent":"Gönderildi","skipped":"Atlandı","sent_at":"Gönderildiği Zaman","time":"Zaman","user":"Kullanıcı","email_type":"E-posta Türü","to_address":"Gönderi Adresi","test_email_address":"test için e-posta adresi","send_test":"Test E-postası Gönder","sent_test":"gönderildi!","delivery_method":"Gönderme Metodu","preview_digest":"Özeti Önizle","preview_digest_desc":"Durgun kullanıcılara gönderilen özet e-postaların içeriğini önizle.","refresh":"Yenile","format":"Format","html":"html","text":"yazı","last_seen_user":"Son Görülen Kullanıcı:","reply_key":"Cevapla Tuşu","skipped_reason":"Nedeni Atla","logs":{"none":"Hiç bir kayıt bulunamadı.","filters":{"title":"Filtre","user_placeholder":"kullanıcıadı","address_placeholder":"isim@örnek.com","type_placeholder":"özet, üye olma...","reply_key_placeholder":"cevapla tuşu","skipped_reason_placeholder":"neden"}}},"logs":{"title":"Kayıtlar","action":"İşlem","created_at":"Oluşturuldu","last_match_at":"En Son Eşlenen","match_count":"Eşleşmeler","ip_address":"IP","topic_id":"Konu IDsi","post_id":"Gönderi IDsi","category_id":"Kategori ID","delete":"Sil","edit":"Düzenle","save":"Kaydet","screened_actions":{"block":"engelle","do_nothing":"hiçbir şey yapma"},"staff_actions":{"title":"Görevli Seçenekleri","instructions":"Kullanıcı adları ve aksiyonlara tıklayarak listeyi filtrele. Profil resimlerine tıklayarak kullanıcı sayfalarına git.","clear_filters":"Hepsini Göster","staff_user":"Görevli Kullanıcı","target_user":"Hedef Kullanıcı","subject":"Konu","when":"Ne zaman","context":"Durum","details":"Detaylar","previous_value":"Önceki","new_value":"Yeni","diff":"Diff","show":"Göster","modal_title":"Detaylar","no_previous":"Bir önceki değer yok.","deleted":"Yeni değer yok. Kayıt silindi.","actions":{"delete_user":"kullanıcıyı sil","change_trust_level":"güven seviyesini değiştir","change_username":"kullanıcı adını değiştir","change_site_setting":"websitesi ayarlarını değiştir","change_site_customization":"websitesinin özelleştirmesini değiştir","delete_site_customization":"websitesinin özelleştirmesini sil","suspend_user":"kullanıcıyı uzaklaştır","unsuspend_user":"kullanıcıyı uzaklaştırma","grant_badge":"rozet ver","revoke_badge":"rozeti iptal et","check_email":"e-posta kontrol et","delete_topic":"konuyu sil","delete_post":"gönderiyi sil","impersonate":"rolüne gir","anonymize_user":"kullanıcıyı anonimleştir","roll_up":"IP bloklarını topla","change_category_settings":"kategori ayarlarını değiştir","delete_category":"kategoriyi sil","create_category":"kategori oluştur"}},"screened_emails":{"title":"Taranmış E-postalar","description":"Biri yeni bir hesap oluşturmaya çalıştığında, aşağıdaki e-posta adresleri kontrol edilecek ve kayıt önlenecek veya başka bir aksiyon alınacak.","email":"E-posta Adresi","actions":{"allow":"İzin Ver"}},"screened_urls":{"title":"Taranmış Bağlantılar","description":"Burada listenen URLler spamci olduğu tespit edilmiş kullanıcılar tarafından gönderilerde kullanılmış.","url":"Bağlantı","domain":"Alan Adı"},"screened_ips":{"title":"Taranmış IPler","description":"İzlenen IP adresleri. IP adreslerini beyaz listeye aktarmak için \"İzin ver\"i kullan.","delete_confirm":"%{ip_address} için konulan kuralı kaldırmak istediğinize emin misiniz?","roll_up_confirm":"Tüm ortaklaşa taranmış IP adreslerini subnetlere toplamak istediğinize emin misiniz?","rolled_up_some_subnets":"Bu subnetlere başarıyla toplanmış tüm engellenen IP girişleri: %{subnets}.","rolled_up_no_subnet":"Toplanacak bir şey bulunamadı.","actions":{"block":"Engelle","do_nothing":"İzin Ver","allow_admin":"Yöneticiye İzin Ver"},"form":{"label":"Yeni:","ip_address":"IP adresi","add":"Ekle","filter":"Ara"},"roll_up":{"text":"Topla","title":"En az 'min_ban_entries_for_roll_up' adet giriş olduğu takdirde yeni subnet engelleme girişleri yaratır."}},"logster":{"title":"Hata Kayıtları"}},"impersonate":{"title":"Rolüne gir","help":"Hata bulma ve giderme amaçları için, bu aracı kullanarak kullanıcının rolüne girin. İşiniz bitince sistemdne çıkış yapmanız gerekecek.","not_found":"Bu kullanıcı bulunamadı.","invalid":"Üzgünüz, bu kullanıcının rolüne giremezsiniz."},"users":{"title":"Kullanıcılar","create":"Yönetici Kullanıcı Ekle","last_emailed":"Son E-posta Gönderimi","not_found":"Üzgünüz, bu kullanıcı adı sistemde yok.","id_not_found":"Üzgünüz, bu kullanıcı adı sistemimizde bulunmuyor.","active":"Etkin","show_emails":"E-postaları Göster","nav":{"new":"Yeni","active":"Etkin","pending":"Bekleyen","staff":"Görevli","suspended":"Uzaklaştırılmış","blocked":"Engellenmiş","suspect":"Kuşkulanılan"},"approved":"Onaylanmış mı?","approved_selected":{"other":"({{count}}) kullanıcıyı  onayla "},"reject_selected":{"other":"({{count}}) kullanıcıyı reddet"},"titles":{"active":"Etkin Kullanıcılar","new":"Yeni Kullanıcılar","pending":"Gözden Geçirilmeyi Bekleyen Kullanıcılar","newuser":"Güven seviyesi 0 (Yeni kullanıcı) olan kullanıcılar","basic":"Güven seviyesi 1 (Acemi kullanıcı) olan kullanıcılar","member":"Güven seviyesi 2 (Üye) olan kullanıcılar","regular":"Güven seviyesi 3 (Müdavim) olan kullanıcılar","leader":"Güven seviyesi 4 (Lider) olan kullanıcılar","staff":"Görevli","admins":"Yöneticiler","moderators":"Moderatörler","blocked":"Engellenen Kullanıcılar","suspended":"Uzaklaştırılmış Kullanıcılar","suspect":"Kuşkulanılan Kullanıcılar"},"reject_successful":{"other":"Başarıyla reddedilmiş %{count}  kullanıcı."},"reject_failures":{"other":"Reddedilemeyen %{count}  kullanıcı."},"not_verified":"Onaylanmayan","check_email":{"title":"Bu kullanıcının e-posta adresini ortaya çıkar","text":"Göster"}},"user":{"suspend_failed":"Bu kullanıcı uzaklaştırılırken bir şeyler ters gitti {{error}}","unsuspend_failed":"Bu kullanıcının uzaklaştırması kaldırılırken bir şeyler ters gitti {{error}}","suspend_duration":"Kullanıcı ne kadar uzun bir süre için uzaklaştırılacak?","suspend_duration_units":"(günler)","suspend_reason_label":"Neden uzaklaştırıyorsunuz? Buraya yazdıklarınız bu kullanıcının profil sayfasında \u003cb\u003eherkese gözükecek\u003cb\u003e ve sistemde oturum açtığı anda kullanıcıya gösterilecek. Lütfen yazıyı kısa tutun.","suspend_reason":"Neden","suspended_by":"Uzaklaştıran","delete_all_posts":"Tüm gönderileri sil","delete_all_posts_confirm":"%{posts} gönderi ve %{topics} konu silmek üzeresiniz. Emin misiniz?","suspend":"Uzaklaştır","unsuspend":"Uzaklaştırmayı geri al","suspended":"Uzaklaştırıldı mı?","moderator":"Moderatör mü?","admin":"Yönetici mi?","blocked":"Engellendi mi?","show_admin_profile":"Yönetici","edit_title":"Başlığı Düzenle","save_title":"Başlığı Kaydet","refresh_browsers":"Tarayıcıyı sayfa yenilemesine zorla","refresh_browsers_message":"Mesaj tüm kullanıcılara gönderildi!","show_public_profile":"Herkese Açık Profili Görüntüle","impersonate":"Rolüne gir","ip_lookup":"IP Arama","log_out":"Çıkış Yap","logged_out":"Kullanıcının tüm cihazlarda oturumu kapatılmış","revoke_admin":"Yöneticiliğini İptal Et","grant_admin":"Yönetici Yetkisi Ver","revoke_moderation":"Moderasyonu İptal Et","grant_moderation":"Moderasyon Yetkisi Ver","unblock":"Engeli Kaldır","block":"Engelle","reputation":"İtibar","permissions":"İzinler","activity":"Aktivite","like_count":"Beğenileri / Beğendikleri","last_100_days":"son 100 günde","private_topics_count":"Özel Konular","posts_read_count":"Okuduğu Gönderiler","post_count":"Oluşturduğu Gönderiler","topics_entered":"Görüntülediği Konular","flags_given_count":"Verilen Bayraklar","flags_received_count":"Alınan Bayraklar","warnings_received_count":"Uyarılar Alındı","flags_given_received_count":"Alınan / Verilen Bayraklar","approve":"Onayla","approved_by":"onaylayan","approve_success":"Kullanıcı onaylandı ve etkinleştirme bilgilerini içeren bir e-posta yollandı.","approve_bulk_success":"Tebrikler! Seçilen tüm kullanıcılar onaylandı ve bilgilendirildi.","time_read":"Okunma Süresi","anonymize":"Kullanıcıyı Anonimleştir","anonymize_confirm":"Bu hesabı anonimleştirmek istediğinize EMİN misiniz? Kullanıcı adı ve e-posta değiştirilecek, ve tüm profil bilgileri sıfırlanacak.","anonymize_yes":"Evet, bu hesap anonimleştir","anonymize_failed":"Hesap anonimleştirilirken bir hata oluştu.","delete":"Kullanıcıyı Sil","delete_forbidden_because_staff":"Yöneticiler ve moderatörler silinemez.","delete_posts_forbidden_because_staff":"Yöneticiler ve moderatörlerin tüm gönderileri silinemez.","delete_forbidden":{"other":"Gönderisi olan kullanıcılar silinemez. Kullanıcıyı silmeden önce tüm gönderilerini silin. (%{count} günden eski gönderiler silinemez.)"},"cant_delete_all_posts":{"other":"Tüm gönderileri silemezsiniz. Bazı gönderiler %{count} günden daha eski.  (delete_user_max_post_age ayarı.)"},"cant_delete_all_too_many_posts":{"other":"Tüm gönderileri silemezsiniz çünkü kullanıcının %{count} 'ten daha fazla gönderisi var. (delete_all_posts_max)"},"delete_confirm":"Bu kullanıcıyı silmek istediğinize EMİN misiniz? Bu işlem geri alınamaz!","delete_and_block":"Sil ve bu e-posta ve IP adresini \u003cb\u003eengelle\u003c/b\u003e","delete_dont_block":"Sadece sil","deleted":"Kullanıcı silinmiş.","delete_failed":"Kullanıcı silinirken bir hata oluştu. Kullanıcıyı silmeye çalışmadan önce tüm gönderilerin silindiğinden emin olun. ","send_activation_email":"Etkinleştirme E-postası Gönder","activation_email_sent":"Etkinleştirme e-postası gönderildi.","send_activation_email_failed":"Tekrar etkinleştirme e-postası gönderilirken bir sorun yaşandı. %{error}","activate":"Hesabı aktifleştir","activate_failed":"Kullanıcı etkinleştirilirken bir sorun yaşandı.","deactivate_account":"Hesabı Pasifleştir","deactivate_failed":"Kullanıcı deaktive edilirken bir sorun yaşandı.","unblock_failed":"Kullanıcının engeli kaldırılırken bir sorun yaşandı.","block_failed":"Kullanıcı engellenirken bir sorun yaşandı.","deactivate_explanation":"Deaktive edilmiş bir kullanıcı e-postasını tekrar doğrulamalı.","suspended_explanation":"Uzaklaştırılmış kullanıcılar sistemde oturum açamaz.","block_explanation":"Engellenmiş bir kullanıcı gönderi oluşturamaz veya konu başlatamaz.","trust_level_change_failed":"Kullanıcının güven seviyesi değiştirilirken bir sorun yaşandı.","suspend_modal_title":"Kullanıcıyı Uzaklaştır","trust_level_2_users":"Güven Seviyesi 2 Olan Kullanıcılar","trust_level_3_requirements":"Güven Seviyesi 3 Gereksinimleri","trust_level_locked_tip":"güven seviyesi kitlendi, sistem kullanıcının seviyesini ne yükseltebilecek ne de düşürebilecek","trust_level_unlocked_tip":"güven seviyesi kilidi çözüldü, sistem kullanıcının seviyesini yükseltebilir ya da düşürebilir","lock_trust_level":"Güven Seviyesini Kilitle","unlock_trust_level":"Güvenlik Seviyesi Kilidini Aç","tl3_requirements":{"title":"Güven Seviyesi 3 için Gerekenler","table_title":"Son 100 günde:","value_heading":"Değer","requirement_heading":"Gereksinim","visits":"Ziyaretler","days":"gün","topics_replied_to":"Cevaplanan Konular","topics_viewed":"Görüntülenmiş Konular","topics_viewed_all_time":"Görüntülenmiş Konular (Tüm zamanlar)","posts_read":"Okunmuş Gönderiler","posts_read_all_time":"Okunmuş Gönderiler (Tüm zamanlarda)","flagged_posts":"Bayraklanan Gönderiler","flagged_by_users":"Bayraklayan Kullanıcılar","likes_given":"Verilen Beğeniler","likes_received":"Alınan Beğeniler","likes_received_days":"Alınan beğeniler: tekil günlük","likes_received_users":"Alınan beğeniler: tekil kullanıcı","qualifies":"Güven seviyesi 3 için yeterli.","does_not_qualify":"Güven seviyesi 3 için yeterli değil.","will_be_promoted":"Yakinda terfi ettirilecek.","will_be_demoted":"Yakında seviyesi düşürülecek","on_grace_period":"Şu an terfisi hoşgörü süresinde, seviyesi düşürülmeyecek","locked_will_not_be_promoted":"Güven seviyesi kilitlendi. Seviyesi hiç bir zaman yükseltilmeyecek.","locked_will_not_be_demoted":"Güven seviyesi kilitlendi. Seviyesi hiç bir zaman düşürülmeyecek."},"sso":{"title":"Tek Oturum Açma","external_id":"Harici ID","external_username":"Kullanıcı adı","external_name":"İsim","external_email":"E-posta","external_avatar_url":"Profil Görseli Bağlantısı"}},"user_fields":{"title":"Kullanıcı Alanları","help":"Kullanıcıların doldurabileceği alanlar ekleyin.","create":"Kullanıcı Alanı Oluştur","untitled":"İsimsiz","name":"Alan Adı","type":"Alan Türü","description":"Alan Açıklaması","save":"Kaydet","edit":"Düzenle","delete":"Sil","cancel":"İptal et","delete_confirm":"Bu kullanıcı alanını silmek istediğinize emin misiniz?","options":"Seçenekler","required":{"title":"Kayıt olurken zorunlu mu?","enabled":"gerekli","disabled":"isteğe bağlı"},"editable":{"title":"Üyelik sonrası düzenlenebilir mi?","enabled":"düzenlenebilir","disabled":"düzenlenemez"},"show_on_profile":{"title":"Herkese açık profilde göster?","enabled":"profilde gösteriliyor","disabled":"profilde gösterilmiyor"},"field_types":{"text":"Yazı Alanı","confirm":"Onay","dropdown":"Açılır liste"}},"site_text":{"none":"Düzenlemeye başlamak için içerik tipi seçin.","title":"Yazı İçeriği"},"site_settings":{"show_overriden":"Sadece değiştirdiklerimi göster","title":"Ayarlar","reset":"sıfırla","none":"Hiçbiri","no_results":"Hiç sonuç bulunamadı.","clear_filter":"Temizle","add_url":"URL ekle","add_host":"sunucu ekle","categories":{"all_results":"Hepsi","required":"Gerekli Ayarlar","basic":"Genel Ayarlar","users":"Kullanıcılar","posting":"Gönderiler","email":"E-posta","files":"Dosyalar","trust":"Güven Seviyeleri","security":"Güvenlik","onebox":"Tek Kutu","seo":"SEO","spam":"Spam","rate_limits":"Oran Sınırları","developer":"Geliştirici","embedding":"Yerleştirme","legal":"Yasal","uncategorized":"Diğer","backups":"Yedekler","login":"Oturum Açma","plugins":"Eklentiler","user_preferences":"Kullanıcı Tercihleri"}},"badges":{"title":"Rozetler","new_badge":"Yeni Rozet","new":"Yeni","name":"İsim","badge":"Rozet","display_name":"Görünen Ad","description":"Açıklama","badge_type":"Rozet Türü","badge_grouping":"Grup","badge_groupings":{"modal_title":"Rozet Gruplamaları"},"granted_by":"Tarafından Verildi","granted_at":"Tarihinde Verildi","reason_help":"(Bir mesaj ya da konuya bağlantı)","save":"Kaydet","delete":"Sil","delete_confirm":"Bu rozeti silmek istediğinize emin misiniz?","revoke":"İptal Et","reason":"Neden","expand":"Genişlet \u0026hellip;","revoke_confirm":"Bu rozeti iptal etmek istediğinize emin misiniz?","edit_badges":"Rozetleri Düzenle","grant_badge":"Rozet Ver","granted_badges":"Verilen Rozetler","grant":"Ver","no_user_badges":"%{name} hiç bir rozet almamış.","no_badges":"Verilebilecek bir rozet yok.","none_selected":"Başlamak için bir rozet seçin","allow_title":"Rozetin ünvan olarak kullanılmasına izin ver","multiple_grant":"Birden çok defa verilebilir","listable":"Rozeti herkese gözüken rozetler sayfasında göster","enabled":"Rozeti etkinleştir","icon":"İkon","image":"Görsel","icon_help":"Font Awesome sınıfı veya görsel URL'i kullanın","query":"Rozet Sorgusu (SQL)","target_posts":"Sorgu gönderileri hedefliyor","auto_revoke":"Geri alma sorgusunu her gün çalıştır.","show_posts":"Rozet alınmasına sebep olan gönderileri rozetler sayfasında göster","trigger":"Tetikleme","trigger_type":{"none":"Her gün güncelle","post_action":"Bir kullanıcı gönderiyle etkileşime geçtiğinde","post_revision":"Bir kullanıcı bir gönderiyi düzenlediğinde veya yeni bir gönderi oluşturduğunda","trust_level_change":"Bir kullanıcı güven seviyesini değiştirdiğinde","user_change":"Bir kullanıcı düzenlendiğinde veya oluşturduğunda"},"preview":{"link_text":"Verilen rozetleri önizle","plan_text":"Sorgu planıyla önizle","modal_title":"Rozet Sorgusunu Özizle","sql_error_header":"Sorgu ile ilgili bir hata oluştu.","error_help":"Rozet sorgularıyla ilgili yardım için aşağıdaki bağlantılara bakın","bad_count_warning":{"header":"UYARI!","text":"Bazı veriliş örnekleri bulunamıyor. Bu durum, rozet sorgusundan varolmayan kullanıcı IDsi veya gönderi IDsi dönünce gerçekleşir. İleride beklenmedik sonuçlara sebep olabilir - lütfen sorgunuzu tekrar kontrol edin."},"no_grant_count":"Verilecek rozet bulunmuyor.","grant_count":{"other":"\u003cb\u003e%{count}\u003c/b\u003e rozet verilecek."},"sample":"Örnek:","grant":{"with":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e","with_post":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e buradaki gönderi için %{link} ","with_post_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e %{link} gönderisi için \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e zamanında","with_time":"\u003cspan class=\"username\"\u003e%{username}\u003c/span\u003e, \u003cspan class=\"time\"\u003e%{time}\u003c/span\u003e"}}},"emoji":{"title":"Emoji","help":"Herkese açık yeni bir emoji ekle. (PROTIP: birden çok dosyayı tek seferde sürükleyip bırakabilirsiniz)","add":"Yeni Emoji Ekle","name":"İsim","image":"Görsel","delete_confirm":":%{name}: emojisini silmek istediğinize emin misiniz?"},"embedding":{"get_started":"Eğer Discourse'u bir başka web sitesine gömmek istiyorsanız, bu sitenin hostunu ekleyerek başlayın.","confirm_delete":"Bu hostu silmek istediğinize emin misiniz?","sample":"Discourse konuları oluşturmak ve gömmek için aşağıdaki HTML kodunu sitenizde kullanın. \u003cb\u003eREPLACE_ME\u003c/b\u003e'yi Discourse'u gömdüğünüz sayfanın tam URL'i ile değiştirin.","title":"Gömme","host":"İzin Verilen Hostlar","edit":"düzenle","category":"Kategoriye Gönder","add_host":"Host Ekle","settings":"Ayarları Gömmek","feed_settings":"Ayarları Besle","feed_description":"Siteniz için bir RSS/ATOM beslemesi sağlamanız Discourse'un içeriğinizi içe aktarma yeteneğini geliştirebilir.","crawling_settings":"Böcek Ayarları","crawling_description":"Discourse gönderileriniz için konular oluşturduğu zaman, eğer bir RSS/ATOM beslemesi yoksa içeriğinizi HTML'inizden ayrıştırmaya çalışacaktır. Bazen içeriğinizi çıkartmak çok zor olabilir, bu yüzden ayrıştırmayı kolaylaştırmak için CSS kuralları belirtme yeteneği sağlıyoruz.","embed_by_username":"Konu oluşturmak için kullanıcı adı","embed_post_limit":"Gömmek için en büyük gönderi sayısı","embed_username_key_from_feed":"Discourse kullanıcı adını beslemeden çekmek için anahtar","embed_truncate":"Gömülü gönderileri buda","embed_whitelist_selector":"Gömülüler içinde izin verilen elementler için CSS seçici","embed_blacklist_selector":"Gömülülerden kaldırılan elementler için CSS seçici","feed_polling_enabled":"Konuları RSS/ATOM aracılığıyla içe aktar","feed_polling_url":"İstila etmek için RSS/ATOM beslemesi URL'i","save":"Gömme Ayarlarını Kaydet"},"permalink":{"title":"Kalıcı Bağlantılar","url":"Bağlantı","topic_id":"Konu ID","topic_title":"Konu","post_id":"Gönderi ID","post_title":"Gönderi","category_id":"Kategori ID","category_title":"Kategori","external_url":"Harici Bağlantı","delete_confirm":"Bu kalıcı bağlantıyı silmek istediğinize emin misiniz?","form":{"label":"Yeni:","add":"Ekle","filter":"Ara (Bağlantı veya Harici Bağlantı)"}}},"lightbox":{"download":"indir"},"search_help":{"title":"Yardımda Ara"},"keyboard_shortcuts_help":{"title":"Klavye Kısayolları","jump_to":{"title":"Şuraya Geç","home":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eh\u003c/b\u003e Anasayfa","latest":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003el\u003c/b\u003e En Son","new":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003en\u003c/b\u003e Yeniler","unread":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eu\u003c/b\u003e Okunmamış","categories":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ec\u003c/b\u003e Kategoriler","top":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e En Popüler","bookmarks":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003eb\u003c/b\u003e İşaretliler","profile":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003ep\u003c/b\u003e Profil","messages":"\u003cb\u003eg\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e İletiler"},"navigation":{"title":"Navigasyon","jump":"\u003cb\u003e#\u003c/b\u003e # numaralı gönderiye git","back":"\u003cb\u003eu\u003c/b\u003e Geri","up_down":"\u003cb\u003ek\u003c/b\u003e/\u003cb\u003ej\u003c/b\u003e seçileni taşı \u0026uarr; \u0026darr;","open":"\u003cb\u003eo\u003c/b\u003e or \u003cb\u003eEnter\u003c/b\u003e Seçili konuyu aç","next_prev":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ej\u003c/b\u003e/\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ek\u003c/b\u003e Sonraki/önceki bölüm"},"application":{"title":"Uygulama","create":"\u003cb\u003ec\u003c/b\u003e Yeni konu aç","notifications":"\u003cb\u003en\u003c/b\u003e Bildirileri aç","hamburger_menu":"\u003cb\u003e=\u003c/b\u003e Hamburger menüsünü aç","user_profile_menu":"\u003cb\u003ep\u003c/b\u003e Kullanıcı menüsünü aç","show_incoming_updated_topics":"\u003cb\u003e.\u003c/b\u003e Güncellenmiş konuları göster","search":"\u003cb\u003e/\u003c/b\u003e Arama","help":"\u003cb\u003e?\u003c/b\u003e Klavye yardımını göster","dismiss_new_posts":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Yeni Konuları/Gönderleri Yoksay","dismiss_topics":"\u003cb\u003ex\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Konuları Yoksay","log_out":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e \u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ez\u003c/b\u003e Çıkış Yapın"},"actions":{"title":"Seçenekler","bookmark_topic":"\u003cb\u003ef\u003c/b\u003e Konu işaretlenmesini aç/kapa","pin_unpin_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003ep\u003c/b\u003e Konuyu başa tuttur / tutturma","share_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003es\u003c/b\u003e Konuyu paylaş","share_post":"\u003cb\u003es\u003c/b\u003e Gönderiyi paylaş","reply_as_new_topic":"\u003cb\u003et\u003c/b\u003e Bağlantılı konu olarak cevapla","reply_topic":"\u003cb\u003eshift\u003c/b\u003e+\u003cb\u003er\u003c/b\u003e Konuya cevap yaz","reply_post":"\u003cb\u003er\u003c/b\u003e Gönderiyi cevapla","quote_post":"\u003cb\u003eq\u003c/b\u003e Gönderiyi alıntıla","like":"\u003cb\u003el\u003c/b\u003e Gönderiyi beğen","flag":"\u003cb\u003e!\u003c/b\u003e Gönderiyi Bayrakla","bookmark":"\u003cb\u003eb\u003c/b\u003e Gönderiyi işaretle","edit":"\u003cb\u003ee\u003c/b\u003e Gönderiyi düzenle","delete":"\u003cb\u003ed\u003c/b\u003e Gönderiyi sil","mark_muted":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003em\u003c/b\u003e Konuyu sustur","mark_regular":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003er\u003c/b\u003e Standart (varsayılan) konu","mark_tracking":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003et\u003c/b\u003e Konuyu takip et","mark_watching":"\u003cb\u003em\u003c/b\u003e, \u003cb\u003ew\u003c/b\u003e Konuyu gözle"}},"badges":{"title":"Rozetler","allow_title":"ünvan olarak kullanılabilir","multiple_grant":"birden fazla kez verilebilir","badge_count":{"other":"%{count} Rozet"},"more_badges":{"other":"+%{count} Daha"},"granted":{"other":"%{count} kez verildi"},"select_badge_for_title":"Ünvan olarak kullanmak için bir rozet seçin","none":"\u003cnone\u003e","badge_grouping":{"getting_started":{"name":"Başlarken"},"community":{"name":"Topluluk"},"trust_level":{"name":"Güven Seviyesi"},"other":{"name":"Diğer"},"posting":{"name":"Gönderiler"}},"badge":{"editor":{"name":"Editör","description":"İlk gönderi düzenleme"},"basic_user":{"name":"Acemi","description":"Tüm temel topluluk işlevleri için \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/4\"\u003ehak verildi\u003c/a\u003e"},"member":{"name":"Üye","description":"Davetiye gönderebilme \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/5\"\u003ehakkı verildi\u003c/a\u003e"},"regular":{"name":"Müdavim","description":"Konuların isimlerini ve kategorilerini değiştirebilme, follow'lu bağlantı paylaşabilme ve lobiye girebilme \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/6\"\u003ehakları verildi\u003c/a\u003e"},"leader":{"name":"Lider","description":"Tüm gönderileri düzenleyebilme, konuları başa tutturabilme, kapatabilme, arşivleyebilme, bölebilme ve birleştirebilme \u003ca href=\"https://meta.discourse.org/t/what-do-user-trust-levels-do/4924/7\"\u003ehakları verildi\u003c/a\u003e "},"welcome":{"name":"Hoş geldiniz","description":"Bir beğeni aldı"},"autobiographer":{"name":"Otobiyografi Yazarı","description":"Kullanıcı \u003ca href=\"/my/preferences\"\u003eprofil\u003c/a\u003e bilgilerini doldurmuş"},"anniversary":{"name":"Yıldönümü","description":"Bir yıldır aktif kullanıcı, en az bir kere gönderi oluşturmuş."},"nice_post":{"name":"Güzel Gönderi","description":"Bir gönderiden 10 beğeni alındı. Bu rozet birden fazla defa verilebilir."},"good_post":{"name":"İyi Gönderi","description":"Bir gönderiden 25 beğeni alındı. Bu rozet birden fazla defa verilebilir."},"great_post":{"name":"Harika Gönderi","description":"Bir gönderiden 50 beğeni alındı. Bu rozet birden fazla defa verilebilir."},"nice_topic":{"name":"Güzel Konu","description":"Bir konuda 10 beğeni almış. Bu rozet birden çok kez kazanılabilir."},"good_topic":{"name":"İyi Konu","description":"Bir konuda 25 beğeni almış. Bu rozet birden çok kez kazanılabilir."},"great_topic":{"name":"Harika Konu","description":"Bir konuda 50 beğeni almış. Bu rozet birden çok kez kazanılabilir."},"nice_share":{"name":"Güzel Paylaşım","description":"25 tekil kullanıcı ile bir gönderiyi paylaşmış"},"good_share":{"name":"İyi Paylaşım","description":"300 tekil kullanıcı ile bir gönderiyi paylaşmış"},"great_share":{"name":"Harika Paylaşım","description":"1000 tekil kullanıcı ile bir gönderiyi paylaşmış"},"first_like":{"name":"İlk beğeni","description":"Bir gönderi beğendi"},"first_flag":{"name":"İlk Bayrak","description":"Bir gönderiyi bayrakladı"},"promoter":{"name":"Destekçi","description":"Kullanıcı davet etti"},"campaigner":{"name":"Katılanlar","description":"3 normal kullanıcı davet etti (Güven seviyesi 1)"},"champion":{"name":"Şampiyon","description":"5 kullanıcı davet etti (Güven seviyesi 2)"},"first_share":{"name":"İlk paylaşım","description":"Bir gönderi paylaştı"},"first_link":{"name":"İlk bağlantı","description":"Başka bir konuya iç bağlantı eklendi"},"first_quote":{"name":"İlk alıntı","description":"Bir kullanıcıyı alıntıladı"},"read_guidelines":{"name":"Yönergeler okundu","description":"\u003ca href=\"/guidelines\"\u003eTopluluk yönergelerini\u003c/a\u003e oku"},"reader":{"name":"Okuyucu","description":"100'den fazla gönderiye sahip bir konudaki tüm gönderileri oku"},"popular_link":{"name":"Gözde Bağlantı","description":"En az 50 kere tıklanmış harici bir bağlantı gönderildi"},"hot_link":{"name":"Sıcak Bağlantı","description":"En az 300 kere tıklanmış harici bir bağlantı gönderildi"},"famous_link":{"name":"Ünlü Bağlantı","description":"En az 1000 kere tıklanmış harici bir bağlantı gönderildi"}}},"google_search":"\u003ch3\u003eGoogle'la Ara\u003c/h3\u003e\n\u003cp\u003e\n\u003cform action='//google.com/search' id='google-search' onsubmit=\"document.getElementById('google-query').value = 'site:' + window.location.host + ' ' + document.getElementById('user-query').value; return true;\"\u003e\n\u003cinput type=\"text\" id='user-query' value=\"\"\u003e\n\u003cinput type='hidden' id='google-query' name=\"q\"\u003e\n\u003cbutton class=\"btn btn-primary\"\u003eGoogle\u003c/button\u003e\n\u003c/form\u003e\n\u003c/p\u003e\n"}},"en":{"js":{"number":{"human":{"storage_units":{"units":{"byte":{"one":"Byte"}}}}},"dates":{"tiny":{"less_than_x_seconds":{"one":"\u003c 1s"},"x_seconds":{"one":"1s"},"less_than_x_minutes":{"one":"\u003c 1m"},"x_minutes":{"one":"1m"},"about_x_hours":{"one":"1h"},"x_days":{"one":"1d"},"about_x_years":{"one":"1y"},"over_x_years":{"one":"\u003e 1y"},"almost_x_years":{"one":"1y"}},"medium":{"x_minutes":{"one":"1 min"},"x_hours":{"one":"1 hour"},"x_days":{"one":"1 day"}},"medium_with_ago":{"x_minutes":{"one":"1 min ago"},"x_hours":{"one":"1 hour ago"},"x_days":{"one":"1 day ago"}},"later":{"x_days":{"one":"1 day later"},"x_months":{"one":"1 month later"},"x_years":{"one":"1 year later"}}},"links_lowercase":{"one":"link"},"character_count":{"one":"{{count}} character"},"topic_count_latest":{"one":"{{count}} new or updated topic."},"topic_count_unread":{"one":"{{count}} unread topic."},"topic_count_new":{"one":"{{count}} new topic."},"queue":{"has_pending_posts":{"one":"This topic has \u003cb\u003e1\u003c/b\u003e post awaiting approval"},"approval":{"pending_posts":{"one":"You have \u003cstrong\u003e1\u003c/strong\u003e post pending."}}},"directory":{"total_rows":{"one":"1 user"}},"groups":{"empty":{"posts":"There is no post by members of this group.","members":"There is no member in this group.","mentions":"There is no mention of this group.","messages":"There is no message for this group.","topics":"There is no topic by members of this group."},"title":{"one":"group"}},"categories":{"topic_stat_sentence":{"one":"%{count} new topic in the past %{unit}."},"post_stat_sentence":{"one":"%{count} new post in the past %{unit}."}},"user":{"messages":{"groups":"My Groups"},"email":{"frequency":{"one":"We'll only email you if we haven't seen you in the last minute."}},"invited":{"truncated":{"one":"Showing the first invite."}}},"replies_lowercase":{"one":"reply"},"composer":{"group_mentioned":"By using {{group}}, you are about to notify \u003ca href='{{group_link}}'\u003e{{count}} people\u003c/a\u003e.","auto_close":{"all":{"units":""}}},"notifications":{"group_mentioned":"\u003ci title='group mentioned' class='fa fa-at'\u003e\u003c/i\u003e\u003cp\u003e\u003cspan\u003e{{username}}\u003c/span\u003e {{description}}\u003c/p\u003e"},"search":{"result_count":{"one":"1 result for \u003cspan class='term'\u003e\"{{term}}\"\u003c/span\u003e"}},"topics":{"bulk":{"selected":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e topic."}}},"topic":{"new_topics":{"one":"1 new topic"},"unread_topics":{"one":"1 unread topic"},"total_unread_posts":{"one":"you have 1 unread post in this topic"},"unread_posts":{"one":"you have 1 unread old post in this topic"},"new_posts":{"one":"there is 1 new post in this topic since you last read it"},"likes":{"one":"there is 1 like in this topic"},"auto_close_immediate":"The last post in the topic is already %{hours} hours old, so the topic will be closed immediately.","feature_topic":{"already_pinned":{"one":"Topics currently pinned in {{categoryLink}}: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e"},"already_pinned_globally":{"one":"Topics currently pinned globally: \u003cstrong class='badge badge-notification unread'\u003e1\u003c/strong\u003e"}},"controls":"Topic Controls","filters":{"n_posts":{"one":"1 post"}},"split_topic":{"instructions":{"one":"You are about to create a new topic and populate it with the post you've selected."}},"merge_topic":{"instructions":{"one":"Please choose the topic you'd like to move that post to."}},"change_owner":{"instructions":{"one":"Please choose the new owner of the post by \u003cb\u003e{{old_user}}\u003c/b\u003e."}},"multi_select":{"description":{"one":"You have selected \u003cb\u003e1\u003c/b\u003e post."}}},"post":{"deleted_by_author":{"one":"(post withdrawn by author, will be automatically deleted in %{count} hour unless flagged)"},"gap":{"one":"view 1 hidden reply"},"has_replies":{"one":"{{count}} Reply"},"has_likes":{"one":"{{count}} Like"},"has_likes_title":{"one":"1 person liked this post"},"has_likes_title_you":{"one":"you and 1 other person liked this post"},"controls":{"delete_replies":{"confirm":{"one":"Do you also want to delete the direct reply to this post?"}}},"actions":{"defer_flags":{"one":"Defer flag"},"by_you_and_others":{"off_topic":{"one":"You and 1 other flagged this as off-topic"},"spam":{"one":"You and 1 other flagged this as spam"},"inappropriate":{"one":"You and 1 other flagged this as inappropriate"},"notify_moderators":{"one":"You and 1 other flagged this for moderation"},"notify_user":{"one":"You and 1 other sent a message to this user"},"bookmark":{"one":"You and 1 other bookmarked this post"},"like":{"one":"You and 1 other liked this"},"vote":{"one":"You and 1 other voted for this post"}},"by_others":{"off_topic":{"one":"1 person flagged this as off-topic"},"spam":{"one":"1 person flagged this as spam"},"inappropriate":{"one":"1 person flagged this as inappropriate"},"notify_moderators":{"one":"1 person flagged this for moderation"},"notify_user":{"one":"1 person sent a message to this user"},"bookmark":{"one":"1 person bookmarked this post"},"like":{"one":"1 person liked this"},"vote":{"one":"1 person voted for this post"}}},"delete":{"confirm":{"one":"Are you sure you want to delete that post?"}}},"topic_map":{"clicks":{"one":"1 click"}},"views_lowercase":{"one":"view"},"likes_lowercase":{"one":"like"},"users_lowercase":{"one":"user"},"filters":{"latest":{"title_with_count":{"one":"Latest (1)"}},"unread":{"title_with_count":{"one":"Unread (1)"},"lower_title_with_count":{"one":"1 unread"}},"new":{"lower_title_with_count":{"one":"1 new"},"title_with_count":{"one":"New (1)"}},"category":{"title_with_count":{"one":"{{categoryName}} (1)"}}},"docker":{"upgrade":"Your Discourse installation is out of date.","perform_upgrade":"Click here to upgrade."},"poll":{"voters":{"one":"voter"},"total_votes":{"one":"total vote"},"multiple":{"help":{"at_least_min_options":{"one":"You must choose at least \u003cstrong\u003e1\u003c/strong\u003e option."},"up_to_max_options":{"one":"You may choose up to \u003cstrong\u003e1\u003c/strong\u003e option."},"x_options":{"one":"You must choose \u003cstrong\u003e1\u003c/strong\u003e option."}}}},"static_pages":{"pages":"Pages","refresh":"Refresh","new":"New","view":"View","edit":"Edit","create":"Create","update":"Update","delete":"Delete","cancel":"Cancel","page":"Page","created":"Created","updated":"Updated","actions":"Actions","title":"Title","body":"Body"},"admin":{"flags":{"summary":{"action_type_3":{"one":"off-topic"},"action_type_4":{"one":"inappropriate"},"action_type_6":{"one":"custom"},"action_type_7":{"one":"custom"},"action_type_8":{"one":"spam"}}},"groups":{"incoming_email":"Custom incoming email address","incoming_email_placeholder":"enter email address"},"customize":{"email_templates":{"multiple_subjects":"This email template has multiple subjects."}},"users":{"approved_selected":{"one":"approve user"},"reject_selected":{"one":"reject user"},"reject_successful":{"one":"Successfully rejected 1 user."},"reject_failures":{"one":"Failed to reject 1 user."}},"user":{"delete_forbidden":{"one":"Users can't be deleted if they have posts. Delete all posts before trying to delete a user. (Posts older than %{count} day old can't be deleted.)"},"cant_delete_all_posts":{"one":"Can't delete all posts. Some posts are older than %{count} day old. (The delete_user_max_post_age setting.)"},"cant_delete_all_too_many_posts":{"one":"Can't delete all posts because the user has more than 1 post. (delete_all_posts_max)"}},"site_text":{"description":"You can customize any of the text on your forum. Please start by searching below:","search":"Search for the text you'd like to edit","edit":"edit","revert":"Revert Changes","revert_confirm":"Are you sure you want to revert your changes?","go_back":"Back to Search","recommended":"We recommend customizing the following text to suit your needs:","show_overriden":"Only show overridden"},"badges":{"preview":{"grant_count":{"one":"\u003cb\u003e1\u003c/b\u003e badge to be assigned."}}}},"badges":{"badge_count":{"one":"1 Badge"},"more_badges":{"one":"+1 More"},"granted":{"one":"1 granted"}}}}};
I18n.locale = 'tr_TR';
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
moment.fn.shortDateNoYear = function(){ return this.format('G AAA'); };
moment.fn.shortDate = function(){ return this.format('D MMM, YYYY'); };
moment.fn.longDate = function(){ return this.format('MMMM D, YYYY h:mma'); };
moment.fn.relativeAge = function(opts){ return Discourse.Formatter.relativeAge(this.toDate(), opts)};

I18n.pluralizationRules['tr_TR'] = function(n) { return "other"; }
;
