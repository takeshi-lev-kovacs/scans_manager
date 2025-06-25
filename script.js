document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selectors ---
    const searchInput = document.getElementById('search-input');
    const roleFilterButtons = document.querySelectorAll('#role-filters button');
    const tagFilterButtons = document.querySelectorAll('#tag-filters button');
    const moduleFilterButtons = document.querySelectorAll('#module-filters button');
    const commandCards = document.querySelectorAll('.command-card');
    const contentArea = document.querySelector('.content-area');
    const commandsContainer = document.querySelector('.commands-container');

    const pageMapList = document.getElementById('map-list');
    // MODIFIED: We need the scrollable container itself, not the inner nav element.
    const pageMapScrollContainer = document.getElementById('page-map');

    // Fullscreen Image Viewer
    const fullscreenOverlay = document.getElementById('fullscreen-overlay');
    const fullscreenImageContainer = document.querySelector('.fullscreen-image-container');
    const fullscreenImage = document.getElementById('fullscreen-image');
    const fullscreenClose = document.getElementById('fullscreen-close');
    const fullscreenPrevBtn = document.getElementById('fullscreen-prev');
    const fullscreenNextBtn = document.getElementById('fullscreen-next');
    const fullscreenDotsContainer = document.getElementById('fullscreen-dots');
    const fullscreenCounter = document.getElementById('fullscreen-counter');
    const fullscreenZoomInBtn = document.getElementById('fullscreen-zoom-in');
    const fullscreenZoomOutBtn = document.getElementById('fullscreen-zoom-out');
    const fullscreenZoomResetBtn = document.getElementById('fullscreen-zoom-reset');

    // Quick Switcher (Ctrl+K Search)
    const qsOverlay = document.getElementById('quick-switcher-overlay');
    const qsModal = document.getElementById('quick-switcher-modal');
    const qsInput = document.getElementById('qs-input');
    const qsResultsList = document.getElementById('qs-results-list');
    const qsNoResults = document.getElementById('qs-no-results');

    // --- State Variables ---
    let mapLinks = [];
    let cardsObserver;
    let currentActiveMapLink = null;
    let fullscreenImageList = [];
    let currentFullscreenIndex = -1;
    let fullscreenDots = [];
    let currentZoom = 1, minZoom = 1, maxZoom = 5, zoomStep = 0.2;
    let isFullscreenPanning = false, startX, startY, translateX = 0, translateY = 0;
    
    let qsVisible = false;
    let qsResults = [];
    let qsActiveIndex = -1;
    
    let isNavigatingViaMap = false;
    let mapNavTimeout;

    // --- Page Map & Intersection Observer ---
    
    // NEW: Function to intelligently scroll the page map to keep the active link centered.
    function smartScrollPageMap(activeLink) {
        if (!pageMapScrollContainer || !activeLink) return;

        const containerHeight = pageMapScrollContainer.clientHeight;
        
        // The link's position relative to the top of the entire scrollable list
        const linkTop = activeLink.offsetTop;
        const linkHeight = activeLink.offsetHeight;

        // Calculate the desired scroll position to center the link
        const desiredScrollTop = linkTop - (containerHeight / 2) + (linkHeight / 2);

        // Calculate the maximum possible scroll position
        const maxScrollTop = pageMapScrollContainer.scrollHeight - containerHeight;
        
        // Clamp the desired scroll position so it doesn't go past the top or bottom
        const finalScrollTop = Math.max(0, Math.min(desiredScrollTop, maxScrollTop));

        // Smoothly scroll the container to the calculated position
        pageMapScrollContainer.scrollTo({
            top: finalScrollTop,
            behavior: 'smooth'
        });
    }

    function generatePageMap() {
        if (!pageMapList) return;
        pageMapList.innerHTML = '';

        commandCards.forEach(card => {
            const id = card.id;
            const title = card.querySelector('.command-title')?.textContent || `Feature ${card.querySelector('.command-number')?.textContent}`;

            const listItem = document.createElement('li');
            listItem.classList.add('map-item');
            const link = document.createElement('a');
            link.classList.add('map-link');
            link.href = `#${id}`;
            link.textContent = title;
            link.dataset.targetId = id;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                isNavigatingViaMap = true;
                clearTimeout(mapNavTimeout);

                const targetElement = document.getElementById(id);
                if (targetElement) {
                    updateActiveMapLink(link);
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    setTimeout(() => {
                        const targetHeader = targetElement.querySelector('.command-header');
                        if (targetElement.classList.contains('collapsed') && targetHeader) {
                            targetHeader.click();
                        }
                    }, 350);

                    mapNavTimeout = setTimeout(() => {
                        isNavigatingViaMap = false;
                    }, 750);
                }
            });

            listItem.appendChild(link);
            pageMapList.appendChild(listItem);
        });
        mapLinks = Array.from(pageMapList.querySelectorAll('.map-link'));
    }

    // MODIFIED: The original updateActiveMapLink function is replaced with this enhanced version.
    function updateActiveMapLink(newActiveLink) {
        if (newActiveLink && newActiveLink !== currentActiveMapLink) {
            currentActiveMapLink?.classList.remove('active');
            newActiveLink.classList.add('active');
            currentActiveMapLink = newActiveLink;

            // Check if the map has a scrollbar before attempting to scroll it
            if (pageMapScrollContainer && pageMapScrollContainer.scrollHeight > pageMapScrollContainer.clientHeight) {
                if (isNavigatingViaMap) {
                    // This was a click, so just ensure it's visible ('nearest' is efficient)
                    currentActiveMapLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    // This was a page scroll, use the new smart centering scroll
                    smartScrollPageMap(currentActiveMapLink);
                }
            }
        }
    }


    function setupIntersectionObserver() {
        if (!pageMapScrollContainer || window.innerWidth < 1024 || mapLinks.length === 0) {
            cardsObserver?.disconnect();
            return;
        }
        const options = { root: null, rootMargin: `-30% 0px -30% 0px`, threshold: 0 };
        
        const callback = (entries) => {
            if (isNavigatingViaMap) return;
            let bestCandidateEntry = null;
            entries.forEach(entry => { if (entry.isIntersecting) bestCandidateEntry = entry; });
            if (bestCandidateEntry) {
                const newActiveLink = mapLinks.find(link => link.dataset.targetId === bestCandidateEntry.target.id);
                updateActiveMapLink(newActiveLink);
            }
        };

        cardsObserver?.disconnect();
        cardsObserver = new IntersectionObserver(callback, options);
        commandCards.forEach(card => { if (!card.classList.contains('hidden')) cardsObserver.observe(card); });
    }

    function refreshObserver() {
        if (window.innerWidth < 1024) {
            cardsObserver?.disconnect();
            if (currentActiveMapLink) {
                currentActiveMapLink.classList.remove('active');
                currentActiveMapLink = null;
            }
            return;
        }
        if (cardsObserver) {
            cardsObserver.disconnect();
            commandCards.forEach(card => { if (!card.classList.contains('hidden')) cardsObserver.observe(card); });
        } else {
            setupIntersectionObserver();
        }
    }

    // --- Main Filtering and Searching (on-page) ---
    function filterAndSearchCommands() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const activeRole = document.querySelector('#role-filters button.active')?.dataset.filter || 'all';
        const activeTag = document.querySelector('#tag-filters button.active')?.dataset.filter || 'all';
        const activeModule = document.querySelector('#module-filters button.active')?.dataset.filter || 'all';

        commandCards.forEach(card => {
            const cardTags = (card.dataset.tags || '').toLowerCase().split(' ');
            const cardRole = (card.dataset.role || '').toLowerCase();
            const cardModule = (card.dataset.module || 'core').toLowerCase();
            const cardText = (card.textContent || '').toLowerCase();

            const roleMatch = activeRole === 'all' || cardRole.includes(activeRole);
            const tagMatch = activeTag === 'all' || cardTags.includes(activeTag) || card.dataset.tags?.toLowerCase().includes(activeTag);
            const moduleMatch = activeModule === 'all' || cardModule.includes(activeModule);
            const searchMatch = searchTerm === '' || cardText.includes(searchTerm);
            
            card.classList.toggle('hidden', !(roleMatch && tagMatch && moduleMatch && searchMatch));
        });
        refreshObserver();
    }

    function handleFilterClick(buttonGroupSelector) {
        document.querySelectorAll(`${buttonGroupSelector} button`).forEach(button => {
            button.addEventListener('click', function() {
                const currentlyActive = document.querySelector(`${buttonGroupSelector} button.active`);
                currentlyActive?.classList.remove('active');
                currentlyActive?.setAttribute('aria-pressed', 'false');
                this.classList.add('active');
                this.setAttribute('aria-pressed', 'true');
                filterAndSearchCommands();
            });
        });
    }

    // --- UI Interactions (Cards, Copy, Carousel) ---
    if (commandsContainer) {
        commandsContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.command-header');
            if (header) {
                const card = header.closest('.command-card');
                if (!card) return;
                const isCollapsed = card.classList.toggle('collapsed');
                header.setAttribute('aria-expanded', String(!isCollapsed));
                return;
            }

            const copyButton = e.target.closest('.copy-btn');
            if (copyButton) {
                e.stopPropagation();
                const commandUsageContainer = copyButton.closest('.command-usage-container');
                if (!commandUsageContainer) return;
                const commandUsageDiv = commandUsageContainer.querySelector('.command-usage');
                if (!commandUsageDiv) return;

                const usageClone = commandUsageDiv.cloneNode(true);
                usageClone.querySelectorAll('.param, .optional').forEach(span => {
                    span.replaceWith(document.createTextNode(span.textContent));
                });
                let textToCopy = usageClone.textContent.trim();

                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = copyButton.textContent;
                    copyButton.textContent = 'Copied!';
                    copyButton.classList.add('copied');
                    setTimeout(() => {
                        copyButton.textContent = originalText;
                        copyButton.classList.remove('copied');
                    }, 1500);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    alert('Failed to copy command.');
                });
                return;
            }
        });
    }


    document.querySelectorAll('.image-area').forEach(area => {
        const container = area.querySelector('.carousel-container');
        const dotsContainer = area.querySelector('.carousel-dots');
        const images = Array.from(container?.querySelectorAll('img') ?? []);

        if (!container || images.length <= 1) {
            if (dotsContainer) dotsContainer.style.display = 'none';
            if (images.length === 1) {
                images[0].style.cursor = 'zoom-in';
                images[0].draggable = false;
                images[0].setAttribute('data-fullscreenable', 'true');
            }
            return;
        }

        let isDown = false, startX, scrollLeftStart, dots = [];
        let scrollEndTimer;

        dotsContainer.innerHTML = '';
        images.forEach((img, i) => {
            const dot = document.createElement('button');
            dot.classList.add('dot');
            dot.setAttribute('aria-label', `Go to image ${i + 1}`);
            dot.addEventListener('click', () => snapToImage(i));
            dotsContainer.appendChild(dot);
            dots.push(dot);
            img.setAttribute('data-fullscreenable', 'true');
            img.style.cursor = 'zoom-in';
            img.draggable = false;
        });

        const updateActiveDot = (targetIndex = -1) => {
            requestAnimationFrame(() => {
                if (images.length === 0) return;
                let activeIndex = targetIndex;
                if (activeIndex === -1) {
                    const containerWidth = container.offsetWidth;
                    if (containerWidth === 0) return;
                    const scrollCenter = container.scrollLeft + containerWidth / 2;
                    let minDistance = Infinity;
                    for (let i = 0; i < images.length; i++) {
                        const imgCenter = i * containerWidth + containerWidth / 2;
                        const distance = Math.abs(scrollCenter - imgCenter);
                        if (distance < minDistance) {
                            minDistance = distance;
                            activeIndex = i;
                        }
                    }
                    activeIndex = Math.max(0, Math.min(images.length - 1, activeIndex));
                }
                dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
            });
        };

        const snapToImage = (targetIndex = -1) => {
            if (images.length === 0) return;
            const containerWidth = container.offsetWidth;
            if (containerWidth === 0) return;
            if (targetIndex === -1) {
                targetIndex = Math.round(container.scrollLeft / containerWidth);
                targetIndex = Math.max(0, Math.min(images.length - 1, targetIndex));
            }
            container.scrollTo({ left: targetIndex * containerWidth, behavior: 'smooth' });
        };

        container.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
            isDown = true;
            container.classList.add('grabbing');
            startX = e.pageX - container.offsetLeft;
            scrollLeftStart = container.scrollLeft;
            container.style.scrollBehavior = 'auto';
            clearTimeout(scrollEndTimer);
        });
        const stopDragging = () => {
            if (!isDown) return;
            isDown = false;
            container.classList.remove('grabbing');
            container.style.scrollBehavior = 'smooth';
            snapToImage();
        };
        container.addEventListener('mouseleave', stopDragging);
        container.addEventListener('mouseup', stopDragging);
        container.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            container.scrollLeft = scrollLeftStart - (e.pageX - container.offsetLeft - startX);
            updateActiveDot();
        });
        container.addEventListener('scroll', () => {
            if (!isDown) {
                updateActiveDot();
                clearTimeout(scrollEndTimer);
                scrollEndTimer = setTimeout(() => snapToImage(), 150);
            }
        }, { passive: true });
        new ResizeObserver(() => {
            const currentActiveDotIndex = dots.findIndex(dot => dot.classList.contains('active'));
            if (currentActiveDotIndex !== -1) {
                container.scrollTo({ left: currentActiveDotIndex * container.offsetWidth, behavior: 'instant' });
            }
            updateActiveDot(currentActiveDotIndex);
        }).observe(container);
        updateActiveDot(0);
    });

    // --- Quick Switcher (Ctrl+K Search) ---
    function openQuickSwitcher() {
        qsOverlay.classList.remove('hidden');
        qsOverlay.classList.add('active');
        qsInput.value = '';
        qsInput.focus();
        updateQuickSwitcherResults();
        qsVisible = true;
    }

    function closeQuickSwitcher() {
        qsOverlay.classList.remove('active');
        qsOverlay.classList.add('hidden');
        qsInput.blur();
        qsVisible = false;
    }

    function updateQuickSwitcherResults() {
        const query = qsInput.value.toLowerCase().trim();
        qsResultsList.innerHTML = '';
        qsResults = [];
        qsActiveIndex = -1;

        if (query) {
            commandCards.forEach(card => {
                const title = (card.querySelector('.command-title')?.textContent || '').toLowerCase();
                const number = (card.querySelector('.command-number')?.textContent || '').toLowerCase();
                const purpose = (card.querySelector('.purpose')?.textContent || '').toLowerCase();
                const score = (title.includes(query) ? 3 : 0) + (purpose.includes(query) ? 1 : 0) + (number === query ? 4 : 0);
                if (score > 0) qsResults.push({ id: card.id, score, element: card });
            });
            qsResults.sort((a, b) => b.score - a.score);
        }

        qsNoResults.classList.toggle('hidden', qsResults.length > 0 || !query);
        qsResults.slice(0, 7).forEach((result, index) => {
            const card = result.element;
            const li = document.createElement('li');
            li.className = 'qs-result-item';
            li.dataset.index = index;
            const icon = `<div class="qs-result-icon">${card.querySelector('.command-number').textContent}</div>`;
            const title = `<div class="qs-result-title">${card.querySelector('.command-title').textContent}</div>`;
            const tags = Array.from(card.querySelectorAll('.command-title-wrapper .tag')).map(t => t.outerHTML).join('');
            li.innerHTML = `${icon}${title}<div class="qs-result-tags">${tags}</div>`;
            li.addEventListener('click', () => selectQuickSwitcherResult(index));
            li.addEventListener('mouseenter', () => setActiveQuickSwitcherItem(index));
            qsResultsList.appendChild(li);
        });
        if (qsResults.length > 0) setActiveQuickSwitcherItem(0);
    }

    function setActiveQuickSwitcherItem(index) {
        document.querySelectorAll('.qs-result-item.active').forEach(item => item.classList.remove('active'));
        const newItem = qsResultsList.querySelector(`[data-index="${index}"]`);
        if (newItem) {
            newItem.classList.add('active');
            newItem.scrollIntoView({ block: 'nearest' });
            qsActiveIndex = index;
        }
    }
    
    function selectQuickSwitcherResult(index = qsActiveIndex) {
        if (index < 0 || index >= qsResults.length) return;
        const targetCard = document.getElementById(qsResults[index].id);
        if (targetCard) {
            closeQuickSwitcher();
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.style.transition = 'box-shadow 0.1s ease-in-out, border-color 0.1s ease-in-out';
            targetCard.style.borderColor = `var(--accent)`;
            targetCard.style.boxShadow = `0 0 0 2px var(--accent)`;
            setTimeout(() => {
                targetCard.style.borderColor = '';
                targetCard.style.boxShadow = '';
            }, 1500);
            if (targetCard.classList.contains('collapsed')) {
                targetCard.querySelector('.command-header')?.click();
            }
        }
    }
    
    function navigateQuickSwitcher(direction) {
        if (qsResults.length === 0) return;
        const newIndex = qsActiveIndex + direction;
        const nextIndex = (newIndex + qsResults.length) % qsResults.length;
        setActiveQuickSwitcherItem(nextIndex);
    }


    // --- Fullscreen Image Viewer ---
    function applyTransform() {
        const safeTranslateX = Number.isFinite(translateX) ? translateX : 0;
        const safeTranslateY = Number.isFinite(translateY) ? translateY : 0;
        const safeZoom = Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1;
        fullscreenImage.style.transform = `translate(${safeTranslateX}px, ${safeTranslateY}px) scale(${safeZoom})`;
    }
    function zoomIn() {
        if (currentZoom >= maxZoom) return;
        currentZoom = Math.min(maxZoom, currentZoom + zoomStep * currentZoom);
        updateZoomButtons();
        applyTransform();
        fullscreenImageContainer.classList.add('zoomed');
    }
    function zoomOut() {
        if (currentZoom <= minZoom) return;
        const prevZoom = currentZoom;
        currentZoom = Math.max(minZoom, currentZoom - zoomStep * currentZoom);
        translateX *= currentZoom / prevZoom;
        translateY *= currentZoom / prevZoom;
        if (currentZoom === minZoom) resetZoom(false);
        else updateZoomButtons();
        applyTransform();
        fullscreenImageContainer.classList.toggle('zoomed', currentZoom > minZoom);
    }
    function resetZoom(apply = true) {
        currentZoom = minZoom;
        translateX = 0;
        translateY = 0;
        updateZoomButtons();
        if (apply) applyTransform();
        fullscreenImageContainer.classList.remove('zoomed', 'grabbing');
        isFullscreenPanning = false;
    }
    function updateZoomButtons() {
        fullscreenZoomInBtn.disabled = currentZoom >= maxZoom;
        fullscreenZoomOutBtn.disabled = currentZoom <= minZoom;
        fullscreenZoomResetBtn.disabled = currentZoom === minZoom && translateX === 0 && translateY === 0;
    }
    function handlePanStart(e) {
        if (currentZoom <= minZoom) return;
        if (e.cancelable) e.preventDefault();
        isFullscreenPanning = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX) - translateX;
        startY = (e.touches ? e.touches[0].clientY : e.clientY) - translateY;
        fullscreenImageContainer.classList.add('grabbing');
        fullscreenImage.style.transition = 'none';
    }
    function handlePanMove(e) {
        if (!isFullscreenPanning || currentZoom <= minZoom) return;
        if (e.cancelable) e.preventDefault();
        translateX = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
        translateY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
        applyTransform();
    }
    function handlePanEnd(e) {
        if (!isFullscreenPanning) return;
        if (e.cancelable) e.preventDefault();
        isFullscreenPanning = false;
        fullscreenImageContainer.classList.remove('grabbing');
        fullscreenImage.style.transition = 'transform 0.3s ease-out, opacity 0.2s ease-in-out';
        updateZoomButtons();
    }
    function handleWheelZoom(e) {
        if (!fullscreenOverlay.classList.contains('active')) return;
        e.preventDefault();
        e.deltaY < 0 ? zoomIn() : zoomOut();
    }
    function setupFullscreenCarousel(clickedImageElement) {
        const parentCarousel = clickedImageElement.closest('.carousel-container');
        if (!parentCarousel && clickedImageElement.matches('img[data-fullscreenable="true"]')) {
            fullscreenImageList = [{ src: clickedImageElement.src, alt: clickedImageElement.alt }];
            currentFullscreenIndex = 0;
        } else if (parentCarousel) {
            const allImages = Array.from(parentCarousel.querySelectorAll('img[data-fullscreenable="true"]'));
            fullscreenImageList = allImages.map(img => ({ src: img.src, alt: img.alt }));
            currentFullscreenIndex = allImages.findIndex(img => img === clickedImageElement);
        } else {
            return;
        }
        if (currentFullscreenIndex === -1) currentFullscreenIndex = 0;
        fullscreenDotsContainer.innerHTML = '';
        fullscreenDots = [];
        if (fullscreenImageList.length > 1) {
            fullscreenImageList.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.classList.add('dot');
                dot.setAttribute('aria-label', `Go to image ${index + 1}`);
                dot.addEventListener('click', (e) => { e.stopPropagation(); displayFullscreenImage(index); });
                fullscreenDotsContainer.appendChild(dot);
                fullscreenDots.push(dot);
            });
        }
        displayFullscreenImage(currentFullscreenIndex);
        fullscreenOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        window.addEventListener('wheel', handleWheelZoom, { passive: false });
    }
    function displayFullscreenImage(index) {
        if (index < 0 || index >= fullscreenImageList.length) return;
        currentFullscreenIndex = index;
        const imageData = fullscreenImageList[index];
        resetZoom(false);
        fullscreenImage.classList.add('loading');
        fullscreenOverlay.classList.add('no-bg-close');
        const img = new Image();
        img.onload = () => {
            fullscreenImage.src = imageData.src;
            fullscreenImage.alt = imageData.alt || 'Fullscreen image';
            fullscreenImage.classList.remove('loading');
            applyTransform();
            setTimeout(() => fullscreenOverlay.classList.remove('no-bg-close'), 50);
            updateZoomButtons();
        };
        img.onerror = () => {
            fullscreenImage.src = "";
            fullscreenImage.alt = "Image failed to load";
            fullscreenImage.classList.remove('loading');
            applyTransform();
            setTimeout(() => fullscreenOverlay.classList.remove('no-bg-close'), 50);
        };
        img.src = imageData.src;
        fullscreenDots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        fullscreenPrevBtn.disabled = index === 0;
        fullscreenNextBtn.disabled = index === fullscreenImageList.length - 1;
        const showNavControls = fullscreenImageList.length > 1;
        fullscreenCounter.textContent = showNavControls ? `Image ${index + 1} / ${fullscreenImageList.length}` : '';
        [fullscreenPrevBtn, fullscreenNextBtn, fullscreenDotsContainer].forEach(el => el.style.display = showNavControls ? 'flex' : 'none');
    }
    function closeFullscreen() {
        fullscreenOverlay.classList.remove('active');
        document.body.style.overflow = '';
        window.removeEventListener('wheel', handleWheelZoom);
        setTimeout(() => {
            resetZoom(false);
            fullscreenImage.src = '';
            fullscreenImage.alt = '';
            fullscreenImageList = [];
            currentFullscreenIndex = -1;
            fullscreenDotsContainer.innerHTML = '';
            fullscreenDots = [];
            isFullscreenPanning = false;
            fullscreenImageContainer.classList.remove('zoomed', 'grabbing');
            fullscreenImage.style.transition = '';
        }, 300);
    }
    
    // --- Event Listeners Setup ---
    function debounce(func, delay = 250) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }
    searchInput.addEventListener('input', debounce(filterAndSearchCommands));

    handleFilterClick('#role-filters');
    handleFilterClick('#tag-filters');
    handleFilterClick('#module-filters');

    contentArea.addEventListener('click', (e) => {
        const targetImage = e.target.closest('img[data-fullscreenable="true"]');
        if (targetImage) {
            e.preventDefault();
            setupFullscreenCarousel(targetImage);
        }
    });

    // Fullscreen Listeners
    fullscreenPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentFullscreenIndex > 0) displayFullscreenImage(currentFullscreenIndex - 1); });
    fullscreenNextBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentFullscreenIndex < fullscreenImageList.length - 1) displayFullscreenImage(currentFullscreenIndex + 1); });
    fullscreenZoomInBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomIn(); });
    fullscreenZoomOutBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomOut(); });
    fullscreenZoomResetBtn.addEventListener('click', (e) => { e.stopPropagation(); resetZoom(); });
    fullscreenImageContainer.addEventListener('mousedown', handlePanStart);
    document.addEventListener('mousemove', handlePanMove);
    document.addEventListener('mouseup', handlePanEnd);
    fullscreenImageContainer.addEventListener('touchstart', handlePanStart, { passive: false });
    document.addEventListener('touchmove', handlePanMove, { passive: false });
    document.addEventListener('touchend', handlePanEnd);
    fullscreenClose.addEventListener('click', (e) => { e.stopPropagation(); closeFullscreen(); });
    fullscreenOverlay.addEventListener('click', (e) => { if (e.target === fullscreenOverlay && !fullscreenOverlay.classList.contains('no-bg-close') && !isFullscreenPanning) closeFullscreen(); });

    // Quick Switcher Listeners
    qsInput.addEventListener('input', updateQuickSwitcherResults);
    qsOverlay.addEventListener('click', (e) => { if (e.target === qsOverlay) closeQuickSwitcher(); });

    // Global Keydown Listener
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            qsVisible ? closeQuickSwitcher() : openQuickSwitcher();
            return;
        }
        if (qsVisible) {
            switch (e.key) {
                case 'Escape': closeQuickSwitcher(); break;
                case 'ArrowDown': e.preventDefault(); navigateQuickSwitcher(1); break;
                case 'ArrowUp': e.preventDefault(); navigateQuickSwitcher(-1); break;
                case 'Enter': e.preventDefault(); selectQuickSwitcherResult(); break;
            }
            return;
        }
        if (fullscreenOverlay.classList.contains('active')) {
            switch (e.key) {
                case 'Escape': closeFullscreen(); break;
                case 'ArrowLeft': fullscreenPrevBtn.click(); break;
                case 'ArrowRight': fullscreenNextBtn.click(); break;
                case '+': case '=': e.preventDefault(); zoomIn(); break;
                case '-': e.preventDefault(); zoomOut(); break;
                case '0': e.preventDefault(); resetZoom(); break;
            }
        }
    });
    
    window.addEventListener('resize', () => {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(refreshObserver, 250);
    });

    // --- Initializations ---
    generatePageMap();
    setupIntersectionObserver();
    filterAndSearchCommands();
});
