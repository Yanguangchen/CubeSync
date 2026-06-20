(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncAutocomplete = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function setFreeTextState(input, isFreeText) {
    if (!input) return;

    if (isFreeText && String(input.value || "").trim()) {
      input.dataset.freeTextEntry = "true";
      return;
    }

    delete input.dataset.freeTextEntry;
  }

  async function setupAutocomplete(inputName, fetchUrl, storageKey) {
    try {
      const fetchFn = typeof window !== "undefined" && window.fetch ? window.fetch : (typeof fetch !== "undefined" ? fetch : null);
      
      let fileOptions = [];
      if (fetchFn) {
        try {
          const response = await fetchFn(encodeURI(fetchUrl));
          if (response.ok) {
            const text = await response.text();
            fileOptions = text.split('\n').map(l => l.trim()).filter(l => l);
          }
        } catch {
          // Ignore missing autocomplete source files.
        }
      }
      
      let localOptions = [];
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          localOptions = JSON.parse(stored);
        }
      } catch {
        // Ignore parsing errors or storage restrictions.
      }
      
      const allOptions = Array.from(new Set([...fileOptions, ...localOptions]));
      
      document.querySelectorAll(`input[name="${inputName}"]`).forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.removeAttribute('list');
        input.dataset.dropdownOptionField = inputName;
        
        let wrapper = input.parentElement;
        if (!wrapper.classList.contains('erp-autocomplete-wrapper')) {
          wrapper = document.createElement('div');
          wrapper.className = 'erp-autocomplete-wrapper';
          input.parentNode.insertBefore(wrapper, input);
          wrapper.appendChild(input);
        }
        
        let dropdown = wrapper.querySelector('.erp-dropdown');
        if (!dropdown) {
          dropdown = document.createElement('ul');
          dropdown.className = 'erp-dropdown';
          wrapper.appendChild(dropdown);
        }
        
        let focusedIndex = -1;
        
        const renderDropdown = (query) => {
          dropdown.innerHTML = '';
          const lowerQuery = query.toLowerCase();
          
          let matches = allOptions.filter(opt => opt.toLowerCase().includes(lowerQuery));
          
          if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
          }
          
          matches.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            if (aLower === lowerQuery) return -1;
            if (bLower === lowerQuery) return 1;
            const aStarts = aLower.startsWith(lowerQuery);
            const bStarts = bLower.startsWith(lowerQuery);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
          });
          
          matches.forEach((match) => {
            const li = document.createElement('li');
            li.className = 'erp-dropdown-item';
            
            const queryLen = query.length;
            const matchIndex = match.toLowerCase().indexOf(lowerQuery);
            if (queryLen > 0 && matchIndex !== -1) {
              const before = match.substring(0, matchIndex);
              const matchedPart = match.substring(matchIndex, matchIndex + queryLen);
              const after = match.substring(matchIndex + queryLen);
              
              let html = '';
              if (before) html += `<strong>${before}</strong>`;
              html += matchedPart;
              if (after) html += `<strong>${after}</strong>`;
              li.innerHTML = html;
            } else {
              li.innerHTML = `<strong>${match}</strong>`;
            }
            
            li.addEventListener('mousedown', (e) => {
              e.preventDefault();
              chooseOption(match);
            });
            
            dropdown.appendChild(li);
          });
          
          dropdown.style.display = 'block';
          focusedIndex = -1;
        };
        
        const closeDropdown = () => {
          dropdown.style.display = 'none';
          focusedIndex = -1;
        };

        const chooseOption = (value) => {
          input.dataset.autocompleteSelecting = "true";
          input.dataset.selectedFromDropdown = "true";
          input.value = value;
          setFreeTextState(input, false);
          input.dispatchEvent(new window.Event('input', { bubbles: true }));
          delete input.dataset.autocompleteSelecting;
          closeDropdown();
        };
        
        const updateFocus = () => {
          const items = dropdown.querySelectorAll('.erp-dropdown-item');
          items.forEach((item, idx) => {
            if (idx === focusedIndex) {
              item.classList.add('selected');
              if (typeof item.scrollIntoView === 'function') {
                item.scrollIntoView({ block: 'nearest' });
              }
            } else {
              item.classList.remove('selected');
            }
          });
        };
        
        input.addEventListener('focus', () => renderDropdown(input.value));
        input.addEventListener('input', () => {
          if (input.dataset.autocompleteSelecting !== "true") {
            delete input.dataset.selectedFromDropdown;
            setFreeTextState(input, true);
          }
          renderDropdown(input.value);
        });
        input.addEventListener('blur', function () {
          closeDropdown();
          if (input.dataset.selectedFromDropdown !== "true" && String(input.value || "").trim()) {
            setFreeTextState(input, true);
          }
        });
        
        input.addEventListener('keydown', (e) => {
          const items = dropdown.querySelectorAll('.erp-dropdown-item');
          if (dropdown.style.display === 'block' && items.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusedIndex = (focusedIndex + 1) % items.length;
              updateFocus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusedIndex = (focusedIndex - 1 + items.length) % items.length;
              updateFocus();
            } else if (e.key === 'Enter') {
              if (focusedIndex >= 0 && focusedIndex < items.length) {
                e.preventDefault();
                chooseOption(items[focusedIndex].textContent);
              }
            } else if (e.key === 'Escape') {
              closeDropdown();
            }
          }
        });
      });
      
      if (!document.getElementById('erp-dropdown-css')) {
        const style = document.createElement('style');
        style.id = 'erp-dropdown-css';
        style.textContent = `
          .erp-autocomplete-wrapper { position: relative; display: inline-block; width: 100%; }
          .erp-autocomplete-wrapper input:focus { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
          .erp-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #dfe1e5; border-top: none; border-radius: 0 0 24px 24px; box-shadow: 0 4px 6px rgba(32, 33, 36, 0.28); z-index: 1000; list-style: none; padding: 10px 0 20px 0; margin: 0; display: none; max-height: 350px; overflow-y: auto; text-align: left; }
          .erp-dropdown-item { padding: 4px 20px; cursor: pointer; display: flex; align-items: center; font-family: Arial, sans-serif; font-size: 16px; color: #212124; line-height: 24px; }
          .erp-dropdown-item::before { content: "🔍"; margin-right: 14px; opacity: 0.4; font-size: 14px; }
          .erp-dropdown-item:hover, .erp-dropdown-item.selected { background-color: #f1f3f4; }
          .erp-dropdown-item strong { font-weight: 600; }
        `;
        document.head.appendChild(style);
      }
    } catch (e) {
      console.error('Failed to setup autocomplete for', inputName, e);
    }
  }

  return {
    setupAutocomplete: setupAutocomplete,
    setFreeTextState: setFreeTextState
  };
});
