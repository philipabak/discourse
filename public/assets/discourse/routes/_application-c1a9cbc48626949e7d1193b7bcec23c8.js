define("discourse/routes/application", 
  ["discourse/lib/computed","discourse/lib/logout","discourse/lib/show-modal","discourse/mixins/open-composer","discourse/models/category","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var setting = __dependency1__.setting;
    var logout = __dependency2__["default"];
    var showModal = __dependency3__["default"];
    var OpenComposer = __dependency4__["default"];
    var Category = __dependency5__["default"];

    function unlessReadOnly(method) {
      return function () {
        if (this.site.get("isReadOnly")) {
          bootbox.alert(I18n.t("read_only_mode.login_disabled"));
        } else {
          this[method]();
        }
      };
    }

    var ApplicationRoute = Discourse.Route.extend(OpenComposer, {
      siteTitle: setting('title'),

      actions: {

        logout: function () {
          var _this = this;

          if (this.currentUser) {
            this.currentUser.destroySession().then(function () {
              return logout(_this.siteSettings, _this.keyValueStore);
            });
          }
        },

        _collectTitleTokens: function (tokens) {
          tokens.push(this.get('siteTitle'));
          Discourse.set('_docTitle', tokens.join(' - '));
        },

        // Ember doesn't provider a router `willTransition` event so let's make one
        willTransition: function () {
          var router = this.container.lookup('router:main');
          Ember.run.once(router, router.trigger, 'willTransition');
          return this._super();
        },

        // This is here as a bugfix for when an Ember Cloaked view triggers
        // a scroll after a controller has been torn down. The real fix
        // should be to fix ember cloaking to not do that, but this catches
        // it safely just in case.
        postChangedRoute: Ember.K,

        showTopicEntrance: function (data) {
          this.controllerFor('topic-entrance').send('show', data);
        },

        postWasEnqueued: function (details) {
          var title = details.reason ? 'queue_reason.' + details.reason + '.title' : 'queue.approval.title';
          showModal('post-enqueued', { model: details, title: title });
        },

        composePrivateMessage: function (user, post) {
          var self = this;
          this.transitionTo('userActivity', user).then(function () {
            self.controllerFor('user-activity').send('composePrivateMessage', user, post);
          });
        },

        error: function (err, transition) {
          var xhr = {};
          if (err.jqXHR) {
            xhr = err.jqXHR;
          }

          var xhrOrErr = err.jqXHR ? xhr : err;

          var exceptionController = this.controllerFor('exception');

          var c = window.console;
          if (c && c.error) {
            c.error(xhrOrErr);
          }

          exceptionController.setProperties({ lastTransition: transition, thrown: xhrOrErr });

          this.intermediateTransitionTo('exception');
          return true;
        },

        showLogin: unlessReadOnly('handleShowLogin'),

        showCreateAccount: unlessReadOnly('handleShowCreateAccount'),

        showForgotPassword: function () {
          showModal('forgotPassword', { title: 'forgot_password.title' });
        },

        showNotActivated: function (props) {
          showModal('not-activated', { title: 'log_in' }).setProperties(props);
        },

        showUploadSelector: function (toolbarEvent) {
          showModal('uploadSelector').setProperties({ toolbarEvent: toolbarEvent, imageUrl: null, imageLink: null });
        },

        showKeyboardShortcutsHelp: function () {
          showModal('keyboard-shortcuts-help', { title: 'keyboard_shortcuts_help.title' });
        },

        // Close the current modal, and destroy its state.
        closeModal: function () {
          this.render('hide-modal', { into: 'modal', outlet: 'modalBody' });
        },

        /**
          Hide the modal, but keep it with all its state so that it can be shown again later.
          This is useful if you want to prompt for confirmation. hideModal, ask "Are you sure?",
          user clicks "No", reopenModal. If user clicks "Yes", be sure to call closeModal.
        **/
        hideModal: function () {
          $('#discourse-modal').modal('hide');
        },

        reopenModal: function () {
          $('#discourse-modal').modal('show');
        },

        editCategory: function (category) {
          var _this2 = this;

          Category.reloadById(category.get('id')).then(function (atts) {
            var model = _this2.store.createRecord('category', atts.category);
            model.setupGroupsAndPermissions();
            _this2.site.updateCategory(model);
            showModal('editCategory', { model: model });
            _this2.controllerFor('editCategory').set('selectedTab', 'general');
          });
        },

        deleteSpammer: function (user) {
          this.send('closeModal');
          user.deleteAsSpammer(function () {
            window.location.reload();
          });
        },

        checkEmail: function (user) {
          user.checkEmail();
        },

        changeBulkTemplate: function (w) {
          var controllerName = w.replace('modal/', ''),
              factory = this.container.lookupFactory('controller:' + controllerName);

          this.render(w, { into: 'modal/topic-bulk-actions', outlet: 'bulkOutlet', controller: factory ? controllerName : 'topic-bulk-actions' });
        },

        createNewTopicViaParams: function (title, body, category_id, category) {
          this.openComposerWithTopicParams(this.controllerFor('discovery/topics'), title, body, category_id, category);
        },

        createNewMessageViaParams: function (username, title, body) {
          this.openComposerWithMessageParams(username, title, body);
        }
      },

      activate: function () {
        this._super();
        Em.run.next(function () {
          // Support for callbacks once the application has activated
          ApplicationRoute.trigger('activate');
        });
      },

      handleShowLogin: function () {
        var _this3 = this;

        if (this.siteSettings.enable_sso) {
          var returnPath = encodeURIComponent(window.location.pathname);
          window.location = Discourse.getURL('/session/sso?return_path=' + returnPath);
        } else {
          this._autoLogin('login', 'login-modal', function () {
            return _this3.controllerFor('login').resetForm();
          });
        }
      },

      handleShowCreateAccount: function () {
        if (this.siteSettings.enable_sso) {
          var returnPath = encodeURIComponent(window.location.pathname);
          window.location = Discourse.getURL('/session/sso?return_path=' + returnPath);
        } else {
          this._autoLogin('createAccount', 'create-account');
        }
      },

      _autoLogin: function (modal, modalClass, notAuto) {
        var methods = Em.get('Discourse.LoginMethod.all');
        if (!this.siteSettings.enable_local_logins && methods.length === 1) {
          this.controllerFor('login').send('externalLogin', methods[0]);
        } else {
          showModal(modal);
          this.controllerFor('modal').set('modalClass', modalClass);
          if (notAuto) {
            notAuto();
          }
        }
      }

    });

    RSVP.EventTarget.mixin(ApplicationRoute);
    __exports__["default"] = ApplicationRoute;
  });