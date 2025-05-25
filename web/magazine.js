////////////////////////////////////////////////////////////////////////
//
// Neil Marshall - Link Information Technology Ltd 2016
// Forked & mildly refactored by YingaTech UK Ltd, 2025
//
////////////////////////////////////////////////////////////////////////

var MagazineView = {
  magazineMode: false,
  oldScale: 1,
  currentPage: 1,
  maxPages: null,
  currentScale: 1,
  layout:
      window.location.hash.indexOf("single=true") > -1
          ? "single"
          : $(window).width() < $(window).height()
              ? "single"
              : "double",
  maxScale: 2,
  isMobile: false,
  isZoom: false,
  pageCache: {}, // Cache for rendered pages
  pageLoadQueue: [], // Queue for pages to preload
  isLoading: false, // Flag to track if pages are currently being loaded
  devicePixelRatio: window.devicePixelRatio || 1, // Get device pixel ratio for high-DPI displays

  init: function() {
    //Add button download on magazineMode
    $("#toolbarViewerRight").prepend(
        `<button id="magazineMode" class="toolbarButton magazineMode hiddenLargeView" title="Switch to Magazine Mode" tabindex="99" data-l10n-id="magazine_mode">
        <span data-l10n-id="magazine_mode_label">Magazine Mode</span>
      </button>`
    );
    $("#secondaryToolbarButtonContainer").prepend(
        `<button id="secondaryMagazineMode" class="secondaryToolbarButton magazineMode visibleLargeView" title="Switch to Magazine Mode" tabindex="51" data-l10n-id="magazine_mode">
        <span data-l10n-id="magazine_mode_label">Magazine Mode</span>
      </button>`
    );

    $(document).on("click", "#magazineMode,#exitMagazineView", function(e) {
      if (!MagazineView.magazineMode) {
        $("#overlay").show();
        MagazineView.start();
      } else MagazineView.destroy();
    });

    $(document).on("click", "#secondaryMagazineMode", function(e) {
      if (!MagazineView.magazineMode) {
        $("#overlay").show();
        MagazineView.start();
      } else MagazineView.destroy();

      PDFViewerApplication.secondaryToolbar.close();
    });

    if (window.location.hash.indexOf("magazineMode=true") > -1) {
      document.addEventListener(
          "pagesloaded",
          MagazineView.launchMagazineMode,
          true
      );

      const waitForLoadInterval = setInterval(() => {
        if (
            window.PDFViewerApplication &&
            PDFViewerApplication.pdfLoadingTask &&
            PDFViewerApplication.pdfLoadingTask.onProgress !== null
        ) {
          clearInterval(waitForLoadInterval);
          PDFViewerApplication.pdfLoadingTask.onProgress = function (progressData) {
            if (progressData.total) {
              const percent = (progressData.loaded / progressData.total) * 100;
              console.log(`PDF Loading: ${Math.round(percent)}%`);
              $("#loading-percentage").text(`Loading: ${Math.round(percent)}%`);
            } else {
              console.log(`PDF Loaded: ${progressData.loaded} bytes`);
            }
          };
        }
      }, 100);
    } else {
      $("#overlay").hide();
    }
  },

  launchMagazineMode: function(e) {
    document.removeEventListener(
        "pagesloaded",
        MagazineView.launchMagazineMode,
        true
    );
    $("#magazineMode").click();
    if(window.allow_download == 'true'){
      if(MagazineView.magazineMode){
        $('#btn-download').show()
      }else{
        $('#btn-download').hide()
      }
    }
  },

  configureToolbars: function() {
    if (MagazineView.magazineMode) {
      $(".toolbar").hide();
    } else {
      $(".toolbar").show();
    }
  },

  // Preload pages in the background
  preloadPages: function(currentPage) {
    // Clear the queue first
    MagazineView.pageLoadQueue = [];

    // Determine which pages to preload based on current layout
    const pagesToPreload = [];
    const preloadAhead = 4; // Number of pages to preload ahead

    if (MagazineView.layout === "single") {
      // For single page layout, preload the next few pages
      for (let i = 1; i <= preloadAhead; i++) {
        const pageToAdd = currentPage + i;
        if (pageToAdd <= MagazineView.maxPages && !MagazineView.pageCache[pageToAdd]) {
          pagesToPreload.push(pageToAdd);
        }
      }
    } else {
      // For double page layout, preload the next few spreads
      for (let i = 2; i <= preloadAhead * 2; i += 2) {
        const pageToAdd1 = currentPage + i;
        const pageToAdd2 = currentPage + i + 1;

        if (pageToAdd1 <= MagazineView.maxPages && !MagazineView.pageCache[pageToAdd1]) {
          pagesToPreload.push(pageToAdd1);
        }
        if (pageToAdd2 <= MagazineView.maxPages && !MagazineView.pageCache[pageToAdd2]) {
          pagesToPreload.push(pageToAdd2);
        }
      }
    }

    // Add pages to the queue
    MagazineView.pageLoadQueue = pagesToPreload;

    // Start processing the queue if not already loading
    if (!MagazineView.isLoading && MagazineView.pageLoadQueue.length > 0) {
      MagazineView.processPageQueue();
    }
  },

  // Process the page load queue
  processPageQueue: function() {
    if (MagazineView.pageLoadQueue.length === 0) {
      MagazineView.isLoading = false;
      return;
    }

    MagazineView.isLoading = true;
    const pageNumber = MagazineView.pageLoadQueue.shift();

    // Check if page is already cached
    if (MagazineView.pageCache[pageNumber]) {
      setTimeout(MagazineView.processPageQueue, 0);
      return;
    }

    // Load and render the page
    PDFViewerApplication.pdfDocument.getPage(pageNumber).then(function(page) {
      MagazineView.renderPageToCache(page, function() {
        // Continue with the next page in the queue
        setTimeout(MagazineView.processPageQueue, 0);
      });
    }).catch(function(error) {
      console.error("Error preloading page:", error);
      setTimeout(MagazineView.processPageQueue, 0);
    });
  },

  // Render a page to the cache
  renderPageToCache: function(page, callback) {
    const pageNumber = page.pageNumber;

    // Skip if already in cache
    if (MagazineView.pageCache[pageNumber]) {
      if (callback) callback();
      return;
    }

    const destinationCanvas = document.createElement("canvas");

    // A4 aspect ratio is 1:√2 (approximately 1:1.414)
    const A4_ASPECT_RATIO = 1 / 1.414;

    const unscaledViewport = page.getViewport(1);
    const divider = MagazineView.layout == "double" ? 2 : 1;

    // Get the container dimensions
    const containerWidth = $("#mainContainer").width();
    const containerHeight = $("#mainContainer").height();

    // Maximum available width based on layout
    const maxAvailableWidth = containerWidth / divider;

    // Calculate scale to fit width while maintaining A4 aspect ratio
    let baseScale = maxAvailableWidth / unscaledViewport.width;

    // Check if the height would fit when scaled by width
    const scaledHeight = unscaledViewport.width * baseScale / A4_ASPECT_RATIO;
    if (scaledHeight > containerHeight) {
      // If too tall, scale based on height instead
      baseScale = containerHeight / (unscaledViewport.width / A4_ASPECT_RATIO);
    }

    // IMPROVEMENT: Render at higher scale for better quality
    const QUALITY_MULTIPLIER = MagazineView.getOptimalRenderScale();
    const renderScale = baseScale * QUALITY_MULTIPLIER;

    // Get viewports
    const renderViewport = page.getViewport(renderScale);
    const displayViewport = page.getViewport(baseScale);

    // Set canvas internal resolution (what gets rendered)
    destinationCanvas.width = renderViewport.width;
    destinationCanvas.height = renderViewport.height;

    // Set canvas display size (what user sees) - CRITICAL!
    destinationCanvas.style.width = displayViewport.width + "px";
    destinationCanvas.style.height = displayViewport.height + "px";

    // Store information for later use
    destinationCanvas.setAttribute("data-page-number", pageNumber);
    destinationCanvas.setAttribute("data-display-width", displayViewport.width);
    destinationCanvas.setAttribute("data-display-height", displayViewport.height);
    destinationCanvas.id = "magCanvas" + pageNumber;

    const ctx = destinationCanvas.getContext("2d");

    // Enhanced rendering settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const renderContext = {
      canvasContext: ctx,
      viewport: renderViewport,
      intent: 'display'
    };

    page.render(renderContext).promise.then(function() {
      // Store the rendered canvas in cache
      MagazineView.pageCache[pageNumber] = destinationCanvas;
      if (callback) callback();
    }).catch(function(error) {
      console.error("Error rendering page:", error);
      if (callback) callback();
    });
  },

  // Get a page from the cache or render it in-line
  getPageFromCache: function(pageNumber, callback) {
    if (MagazineView.pageCache[pageNumber]) {
      const cachedCanvas = MagazineView.pageCache[pageNumber];

      // Get the intended display size from the cached canvas attributes
      const displayWidth = parseFloat(cachedCanvas.getAttribute("data-display-width"));
      const displayHeight = parseFloat(cachedCanvas.getAttribute("data-display-height"));

      // Create display canvas at correct size
      const displayCanvas = document.createElement('canvas');

      // Account for device pixel ratio for crisp display
      const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);

      displayCanvas.width = displayWidth * pixelRatio;
      displayCanvas.height = displayHeight * pixelRatio;
      displayCanvas.style.width = displayWidth + "px";
      displayCanvas.style.height = displayHeight + "px";

      displayCanvas.setAttribute("data-page-number", pageNumber);
      displayCanvas.id = "magCanvas" + pageNumber;

      const ctx = displayCanvas.getContext('2d');
      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw the high-res cached canvas scaled down to display size
      ctx.drawImage(cachedCanvas, 0, 0, displayWidth, displayHeight);

      callback(displayCanvas);
    } else {
      // Render the page if not in cache
      PDFViewerApplication.pdfDocument.getPage(pageNumber).then(function(page) {
        MagazineView.renderPageToCache(page, function() {
          MagazineView.getPageFromCache(pageNumber, callback);
        });
      }).catch(function(error) {
        console.error("Error getting page:", error);
        callback(null);
      });
    }
  },

  getOptimalRenderScale: function() {
    // Adjust render scale based on device capabilities
    const deviceMemory = navigator.deviceMemory || 4; // Default to 4GB if unknown
    const pixelRatio = window.devicePixelRatio || 1;

    // Higher quality for devices with more memory and high-DPI displays
    if (deviceMemory >= 8 && pixelRatio >= 2) {
      return 3; // Very high quality
    } else if (deviceMemory >= 4 && pixelRatio >= 1.5) {
      return 2.5; // High quality
    } else if (deviceMemory >= 2) {
      return 2; // Standard high quality
    } else {
      return 1.5; // Lower quality for limited devices
    }
  },

  start: function() {
    if (PDFViewerApplication.sidebarOpen)
      document.getElementById("sidebarToggle").click();

    MagazineView.magazineMode = true;
    MagazineView.oldScale = PDFViewerApplication.pdfViewer.currentScale;
    PDFViewerApplication.pdfViewer.currentScaleValue = "page-fit";
    $("#viewerContainer").after(`
      <div id="magazineContainer">
        <div id="magazine"></div>
        <div id="loading-indicator" style="display:none;position:absolute;right:10px;top:10px;background:rgba(0,0,0,0.5);color:white;padding:5px;border-radius:5px;">Loading...</div>
      </div>
      <button class="previous-button">&lt;</button>
      <button class="next-button">&gt;</button>
    `);

    $("#mainContainer .previous-button").on("click", () => {
      $("#magazine").turn("page", MagazineView.currentPage - (MagazineView.isMobile ? 1 : 2));
    });

    $("#mainContainer .next-button").on("click", () => {
      $("#magazine").turn("page", MagazineView.currentPage + (MagazineView.isMobile ? 1 : 2));
    });

    $(document).on("keyup", (e) => {
      if (e.key === "ArrowLeft") {
        $("#magazine").turn("page", MagazineView.currentPage - (MagazineView.isMobile ? 1 : 2));
      } else if (e.key === "ArrowRight") {
        $("#magazine").turn("page", MagazineView.currentPage + (MagazineView.isMobile ? 1 : 2));
      }
    });

    MagazineView.currentPage = PDFViewerApplication.page;
    MagazineView.maxPages = PDFViewerApplication.pdfDocument.numPages;

    MagazineView.configureToolbars();

    $("#viewerContainer").hide();
    $("#magazine").show();

    // Change BackgroundColor
    if (window.location.hash.indexOf("backgroundColor=") > -1) {
      const arr = window.location.hash.split("&");
      const findColor = arr.find(data => {
        let arrNewData = data.split("=");
        return (
            arrNewData[0] === "#backgroundColor" ||
            arrNewData[0] === "backgroundColor"
        );
      });
      const newColor = findColor.replace("#", "").split("=");
      document.body.style.backgroundColor = newColor[1];
      document.body.style.backgroundImage = "none";
    }

    //Detect Mobile Device
    if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
      MagazineView.isMobile = true;
    }

    // Initialize page cache
    MagazineView.pageCache = {};
    MagazineView.pageLoadQueue = [];
    MagazineView.isLoading = false;

    // Load and render first few pages
    const initialPages = [1];
    if (MagazineView.layout === "double" && MagazineView.maxPages > 1) {
      initialPages.push(2);
    }

    // Create a loading promise for initial pages
    const loadInitialPagesPromise = new Promise((resolve) => {
      let pagesLoaded = 0;

      initialPages.forEach(pageNum => {
        PDFViewerApplication.pdfDocument.getPage(pageNum).then(function(page) {
          MagazineView.renderPageToCache(page, function() {
            pagesLoaded++;
            if (pagesLoaded === initialPages.length) {
              resolve();
            }
          });
        });
      });
    });

    loadInitialPagesPromise.then(() => {
      // Add initial pages to magazine
      initialPages.forEach(pageNum => {
        MagazineView.getPageFromCache(pageNum, function(canvas) {
          if (canvas) {
            $("#magazine").append($(canvas));
          }
        });
      });

      // Initialize turn.js
      $("#magazine").turn({
        autoCenter: true,
        display: MagazineView.layout,
        acceleration: !MagazineView.isChrome(),
        elevation: 50,
        duration: 600,
        pages: MagazineView.maxPages,
        when: {
          missing: function(event, pages) {
            // Show loading indicator
            $("#loading-indicator").show();

            // Load missing pages one by one to ensure smooth animation
            let pagesLoaded = 0;
            pages.forEach(pageNum => {
              MagazineView.getPageFromCache(pageNum, (canvas) => {
                if (canvas) {
                  $(this).turn("addPage", $(canvas), pageNum);
                  pagesLoaded++;

                  // Hide loading indicator when all pages are loaded
                  if (pagesLoaded === pages.length) {
                    $("#loading-indicator").hide();
                  }
                }
              });
            });
          },
          turning: function(event, page, view) {
            // Check if the page is loaded
            const pageReady = $("#magazine").turn("hasPage", page);

            if (!pageReady) {
              // If page isn't ready, prepare it and then turn
              MagazineView.getPageFromCache(page, (canvas) => {
                if (canvas) {
                  $(this).turn("addPage", $(canvas), page);
                  $(this).turn("page", page);
                }
              });

              event.preventDefault();
            } else {
              // Update current page
              MagazineView.currentPage = page;

              // Start preloading next pages
              MagazineView.preloadPages(page);

              // Update navigation buttons
              MagazineView.showHidePageButtons(page);
            }
          },
          turned: function(event, page) {
            // Ensure current page is updated
            MagazineView.currentPage = page;

            // Preload next pages after turning is complete
            MagazineView.preloadPages(page);
          }
        }
      });

      setTimeout(function() {
        if ($("#magazine canvas").length > 0) {
          const firstCanvas = $("#magazine canvas")[0];
          const canvasWidth = parseFloat(firstCanvas.style.width);
          const canvasHeight = parseFloat(firstCanvas.style.height);

          let magazineWidth, magazineHeight;

          if (MagazineView.layout === "double") {
            magazineWidth = canvasWidth * 2;
            magazineHeight = canvasHeight;
          } else {
            magazineWidth = canvasWidth;
            magazineHeight = canvasHeight;
          }

          // Set the magazine size directly
          $("#magazine").turn("size", magazineWidth, magazineHeight);

          // Center the magazine in the container
          const marginTop = ($(window).height() - magazineHeight) / 2;
          $("#magazine").css({
            margin: `${marginTop}px auto`
          });

          // If we need to go to a specific page
          if (MagazineView.currentPage > 1) {
            $("#magazine").turn("page", MagazineView.currentPage);
          }
        }
      }, 100);

      MagazineView.showHidePageButtons(MagazineView.currentPage);

      // Start preloading pages
      MagazineView.preloadPages(MagazineView.currentPage);

      setTimeout(function() {
        $("#magazine").turn("display", MagazineView.layout);

        var multiplier = MagazineView.layout == "double" ? 2 : 1;
        var diff = 0;

        if ($(window).width() > $(window).height()) {
          diff = $(window).height() - $("#magazine canvas")[0].height;

          if (($("#magazine canvas")[0].width + diff) * multiplier > $(window).width() && !MagazineView.isMobile) {
            diff = ($(window).width() - $("#magazine canvas")[0].width * 2) / 2;

            $("#magazine").css({
              margin: `${($(window).height() - ($("#magazine canvas")[0].height + diff)) / 2}px 0`
            });
          } else {
            $("#magazine").addClass("center");
          }
        } else {
          diff = $(window).width() - $("#magazine canvas")[0].width;
          if(!MagazineView.isMobile)
            $("#magazine").css({
              margin: `${($(window).height() - ($("#magazine canvas")[0].height + diff)) / 2}px 0`
            });
          else
            $("#magazine").addClass("center");
        }

        $("#magazine").turn(
            "size",
            ($("#magazine canvas")[0].width + diff) * multiplier,
            $("#magazine canvas")[0].height + diff
        );

        if (MagazineView.currentPage > 1)
          $("#magazine").turn("page", MagazineView.currentPage);

        if (!MagazineView.isMobile) {
          $("#magazineContainer").zoom({
            max: MagazineView.maxScale,
            flipbook: $("#magazine"),
            when: {
              doubleTap: function(event) {
                if ($(this).zoom("value") === 1) {
                  $("#magazine").removeClass("transition animated").addClass("zoom-in");
                  $(this).zoom("zoomIn", event);
                } else {
                  $(this).zoom("zoomOut");
                }
              },
              resize: function(event, scale, page, pageElement) {
                MagazineView.currentScale = scale;
                MagazineView.loadTurnJsPages(
                    $("#magazine").turn("view"),
                    $("#magazine"),
                    false,
                    false
                );
              },
              zoomIn: function() {
                $("#magazine").addClass("zoom-in");
                MagazineView.resizeViewport();
              },
              zoomOut: function() {
                setTimeout(() => {
                  $("#magazine")
                      .addClass("transition")
                      .css({
                        marginTop: `${($(window).height() - $("#magazine").height()) / 2}px`
                      })
                      .addClass("animated")
                      .removeClass("zoom-in");
                  MagazineView.resizeViewport();
                }, 0);
              }
            }
          });
        } else {
          const pinchZoomInstance = new window.PinchZoom.default(
              document.querySelector("#magazineContainer"),
              {zoomOutFactor: 1, use2d: false}
          );

          let isCurrentlyZoomed = false;

          document.addEventListener("pz_doubletap", () => {
            isCurrentlyZoomed = !isCurrentlyZoomed;
            // $("#magazine").turn("disable", isCurrentlyZoomed);
          });

          document.addEventListener("pz_zoomstart", () => {
            isCurrentlyZoomed = true;
            // $("#magazine").turn("disable", true);
          });

          document.addEventListener("pz_zoomend", () => {
            const scale = pinchZoomInstance.zoomFactor;
            const isZoomed = scale > 1.05; // More reliable threshold than 1.1
            isCurrentlyZoomed = isZoomed;
            // $("#magazine").turn("disable", isZoomed);
          });
        }
        MagazineView.fixPageAspectRatio();
        $("#overlay").fadeOut();
      }, 10);
    });
  },

  fixPageAspectRatio: function() {
    if(MagazineView.layout !== "double")
    {
      // A4 aspect ratio is 1:√2 (approximately 1:1.414)
      const A4_ASPECT_RATIO = 1 / 1.414;

      $("#magazine canvas").each(function() {
        const canvas = $(this);
        const width = parseFloat(canvas.css("width"));
        const correctHeight = width / A4_ASPECT_RATIO;

        // Fix the height to maintain A4 aspect ratio
        canvas.css("height", correctHeight + "px");
      });
    } else {
      // A4 aspect ratio is (width / height) to correct width from height
      const A4_ASPECT_RATIO = 11.67 / 8.27;

      $("#magazine canvas").each(function() {
        const canvas = $(this);
        const height = parseFloat(canvas.css("height"));
        const correctWidth = height / A4_ASPECT_RATIO;

        // Fix the height to maintain A4 aspect ratio
        canvas.css("width", correctWidth + "px");
      });
    }

    // After fixing all pages, resize the magazine accordingly
    if ($("#magazine canvas").length > 0) {
      const firstCanvas = $("#magazine canvas")[0];
      const canvasWidth = parseFloat(firstCanvas.style.width);
      const canvasHeight = parseFloat(firstCanvas.style.height);

      let magazineWidth, magazineHeight;

      if (MagazineView.layout === "double") {
        magazineWidth = canvasWidth * 2;
        magazineHeight = canvasHeight;
      } else {
        magazineWidth = canvasWidth;
        magazineHeight = canvasHeight;
      }

      // Update the magazine size
      $("#magazine").turn("size", magazineWidth, magazineHeight);
    }
  },

  showHidePageButtons: function(page) {
    if (page == 1)
    { $("#mainContainer .previous-button").hide(); }
    else
    { $("#mainContainer .previous-button").show(); }

    if (page + 1 >= MagazineView.maxPages)
    { $("#mainContainer .next-button").hide(); }
    else
    { $("#mainContainer .next-button").show(); }

    if (page == $("#magazine").turn("pages"))
      $("#mainContainer .next-button").hide();
    else
      $("#mainContainer .next-button").show();
  },

  resizeViewport: function() {
    var width = $(window).width(),
        height = $(window).height(),
        options = $("#magazine").turn("options");

    $("#magazine").removeClass("animated");

    $("#magazineContainer")
        .css({
          width: width,
          height: height
        })
        .zoom("resize");

    if ($("#magazine").turn("zoom") == 2) {
      var bound = MagazineView.calculateBound({
        width: options.width,
        height: options.height,
        boundWidth: Math.min(options.width, width),
        boundHeight: Math.min(options.height, height)
      });

      if (bound.width % 2 !== 0) bound.width -= 1;

      if (
          bound.width != $("#magazine").width() ||
          bound.height != $("#magazine").height()
      ) {
        $("#magazine").turn("size", bound.width, bound.height);

        if ($("#magazine").turn("page") == 1) $("#magazine").turn("peel", "br");
      }

      $("#magazine").css({ top: -bound.height / 2, left: -bound.width / 2 });
    }

    $("#magazine").addClass("animated");
  },

  calculateBound: function(d) {
    var bound = { width: d.width, height: d.height };

    if (bound.width > d.boundWidth || bound.height > d.boundHeight) {
      var rel = bound.width / bound.height;

      if (
          d.boundWidth / rel > d.boundHeight &&
          d.boundHeight * rel <= d.boundWidth
      ) {
        bound.width = Math.round(d.boundHeight * rel);
        bound.height = d.boundHeight;
      } else {
        bound.width = d.boundWidth;
        bound.height = Math.round(d.boundWidth / rel);
      }
    }

    return bound;
  },

  loadTurnJsPages: function(pages, magazine, isInit, defer, scale) {
    var deferred = null;

    if (defer) deferred = $.Deferred();

    var pagesRendered = 0;
    for (var i = 0; i < pages.length; i++) {
      if (pages[i] != 0) {
        // Try to get the page from cache first
        if (MagazineView.pageCache[pages[i]]) {
          const cachedCanvas = MagazineView.pageCache[pages[i]];

          if (!isInit) {
            if ($(magazine).turn("hasPage", pages[i])) {
              var oldCanvas = $("#magCanvas" + pages[i])[0];
              if (oldCanvas) {
                oldCanvas.width = cachedCanvas.width;
                oldCanvas.height = cachedCanvas.height;
                oldCanvas.style.width = cachedCanvas.style.width;
                oldCanvas.style.height = cachedCanvas.style.height;

                var oldCtx = oldCanvas.getContext("2d");
                oldCtx.imageSmoothingEnabled = true;
                oldCtx.imageSmoothingQuality = 'high';
                oldCtx.drawImage(cachedCanvas, 0, 0);
              }
            } else {
              // Clone the cached canvas for adding to magazine
              const clonedCanvas = document.createElement('canvas');
              clonedCanvas.width = cachedCanvas.width;
              clonedCanvas.height = cachedCanvas.height;
              clonedCanvas.style.width = cachedCanvas.style.width;
              clonedCanvas.style.height = cachedCanvas.style.height;
              clonedCanvas.setAttribute("data-page-number", pages[i]);
              clonedCanvas.id = "magCanvas" + pages[i];

              const ctx = clonedCanvas.getContext('2d');
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(cachedCanvas, 0, 0);

              $(magazine).turn("addPage", $(clonedCanvas), pages[i]);
            }
          } else {
            // Clone the cached canvas for adding to magazine
            const clonedCanvas = document.createElement('canvas');
            clonedCanvas.width = cachedCanvas.width;
            clonedCanvas.height = cachedCanvas.height;
            clonedCanvas.style.width = cachedCanvas.style.width;
            clonedCanvas.style.height = cachedCanvas.style.height;
            clonedCanvas.setAttribute("data-page-number", pages[i]);
            clonedCanvas.id = "magCanvas" + pages[i];

            const ctx = clonedCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(cachedCanvas, 0, 0);

            $("#magazine").append($(clonedCanvas));
          }

          pagesRendered++;
          if (pagesRendered == pages.length && deferred) deferred.resolve();
        } else {
          // Render the page if not in cache
          PDFViewerApplication.pdfDocument.getPage(pages[i]).then(function(page) {
            MagazineView.renderPageToCache(page, function() {
              const pageNumber = page.pageNumber;
              const cachedCanvas = MagazineView.pageCache[pageNumber];

              if (!cachedCanvas) {
                console.error("Failed to render page", pageNumber);
                pagesRendered++;
                if (pagesRendered == pages.length && deferred) deferred.resolve();
                return;
              }

              if (!isInit) {
                if ($(magazine).turn("hasPage", pageNumber)) {
                  var oldCanvas = $("#magCanvas" + pageNumber)[0];
                  if (oldCanvas) {
                    oldCanvas.width = cachedCanvas.width;
                    oldCanvas.height = cachedCanvas.height;
                    oldCanvas.style.width = cachedCanvas.style.width;
                    oldCanvas.style.height = cachedCanvas.style.height;

                    var oldCtx = oldCanvas.getContext("2d");
                    oldCtx.imageSmoothingEnabled = true;
                    oldCtx.imageSmoothingQuality = 'high';
                    oldCtx.drawImage(cachedCanvas, 0, 0);
                  }
                } else {
                  // Clone the cached canvas for adding to magazine
                  const clonedCanvas = document.createElement('canvas');
                  clonedCanvas.width = cachedCanvas.width;
                  clonedCanvas.height = cachedCanvas.height;
                  clonedCanvas.style.width = cachedCanvas.style.width;
                  clonedCanvas.style.height = cachedCanvas.style.height;
                  clonedCanvas.setAttribute("data-page-number", pageNumber);
                  clonedCanvas.id = "magCanvas" + pageNumber;

                  const ctx = clonedCanvas.getContext('2d');
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  ctx.drawImage(cachedCanvas, 0, 0);

                  $(magazine).turn("addPage", $(clonedCanvas), pageNumber);
                }
              } else {
                // Clone the cached canvas for adding to magazine
                const clonedCanvas = document.createElement('canvas');
                clonedCanvas.width = cachedCanvas.width;
                clonedCanvas.height = cachedCanvas.height;
                clonedCanvas.style.width = cachedCanvas.style.width;
                clonedCanvas.style.height = cachedCanvas.style.height;
                clonedCanvas.setAttribute("data-page-number", pageNumber);
                clonedCanvas.id = "magCanvas" + pageNumber;

                const ctx = clonedCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(cachedCanvas, 0, 0);

                $("#magazine").append($(clonedCanvas));
              }

              pagesRendered++;
              if (pagesRendered == pages.length && deferred) deferred.resolve();
            });
          });
        }
      }
    }

    if (deferred) return deferred;
  },

  destroy: function() {
    MagazineView.magazineMode = false;
    PDFViewerApplication.pdfViewer.currentScale = MagazineView.oldScale;
    PDFViewerApplication.page = MagazineView.currentPage;

    // Clear page cache to free memory
    MagazineView.pageCache = {};
    MagazineView.pageLoadQueue = [];
    MagazineView.isLoading = false;

    $("#magazineContainer").hide();
    $("#magazineContainer").empty();
    $("#viewerContainer").show();

    MagazineView.configureToolbars();
  },

  isChrome: function() {
    return navigator.userAgent.indexOf("Chrome") != -1;
  }
};