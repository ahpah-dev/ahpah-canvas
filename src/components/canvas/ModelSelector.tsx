import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  CircleDollarSign,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type { GatewayModel } from "../../utils/gateways";
import {
  currentModelRecommendations,
  isAutomaticModel,
  isFreeModel,
  isPaidModel,
  sortModelCatalog,
} from "../../utils/modelCatalog";

type PricingFilter = "all" | "free" | "paid" | "unverified";

const MAX_VISIBLE_MODELS = 60;

function isValidModelId(value: string) {
  if (!value || value.length > 256) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    if (/\s/u.test(character) || codePoint < 32 || codePoint === 127)
      return false;
  }
  return true;
}

const modelPricing = (model: GatewayModel) =>
  isFreeModel(model) ? "Free" : isPaidModel(model) ? "Paid" : "Unverified";

const modelPricingIcon = (model: GatewayModel) =>
  isFreeModel(model) ? <Zap size={11} /> : <CircleDollarSign size={11} />;

export function ModelSelector({
  provider,
  models,
  value,
  onChange,
  onRefresh,
  refreshing = false,
  disabled = false,
}: {
  provider: string;
  models: GatewayModel[];
  value: string;
  onChange: (value: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PricingFilter>("all");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const availableModels = useMemo(() => sortModelCatalog(models), [models]);
  const recommendations = useMemo(
    () => currentModelRecommendations(availableModels),
    [availableModels],
  );
  const selected = availableModels.find((model) => model.id === value);
  const selectedName = selected?.name || value;

  const counts = useMemo(
    () => ({
      all: availableModels.length,
      free: availableModels.filter(isFreeModel).length,
      paid: availableModels.filter(isPaidModel).length,
      unverified: availableModels.filter(
        (model) => !isFreeModel(model) && !isPaidModel(model),
      ).length,
    }),
    [availableModels],
  );

  const visibleMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const ranked = availableModels.flatMap((model, catalogIndex) => {
      if (
        (filter === "free" && !isFreeModel(model)) ||
        (filter === "paid" && !isPaidModel(model)) ||
        (filter === "unverified" && (isFreeModel(model) || isPaidModel(model)))
      ) return [];

      const fields = [
        model.id,
        model.name || "",
        model.owned_by || "",
        model.architecture?.modality || "",
        ...(model.architecture?.output_modalities || []),
      ].map((field) => field.toLocaleLowerCase());
      if (!tokens.every((token) => fields.some((field) => field.includes(token))))
        return [];

      const id = model.id.toLocaleLowerCase();
      const name = (model.name || "").toLocaleLowerCase();
      const rank = !query ? 0
        : id === query ? 0
        : id.startsWith(query) ? 1
        : name.startsWith(query) ? 2
        : id.includes(query) ? 3
        : name.includes(query) ? 4
        : 5;
      return [{ model, rank, catalogIndex }];
    });

    ranked.sort((a, b) => a.rank - b.rank || a.catalogIndex - b.catalogIndex);
    return ranked.map(({ model }) => model);
  }, [availableModels, filter, search]);

  const visibleModels = visibleMatches.slice(0, MAX_VISIBLE_MODELS);
  const activeModel = activeIndex >= 0 ? visibleModels[activeIndex] : undefined;
  const trimmedManualId = manualId.trim();
  const manualIdValid = isValidModelId(trimmedManualId);
  const isManualDuplicate = availableModels.some(
    (model) => model.id.toLocaleLowerCase() === trimmedManualId.toLocaleLowerCase(),
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      const dialog = rootRef.current?.closest<HTMLElement>(".cw-modal");
      if (!trigger || !popover) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = dialog?.getBoundingClientRect();
      const boundaryLeft = bounds?.left || 0;
      const boundaryTop = bounds?.top || 0;
      const boundaryBottom = bounds?.bottom || window.innerHeight;
      const boundaryWidth = bounds?.width || window.innerWidth;
      const width = Math.min(520, boundaryWidth - 24);
      const left = Math.max(
        12,
        Math.min(anchor.left - boundaryLeft, boundaryWidth - width - 12),
      );
      const roomBelow = Math.max(0, boundaryBottom - anchor.bottom - 20);
      const roomAbove = Math.max(0, anchor.top - boundaryTop - 20);
      const opensUp = roomBelow < 380 && roomAbove > roomBelow;
      const maxHeight = Math.max(160, Math.min(600, opensUp ? roomAbove : roomBelow));
      const top = opensUp
        ? anchor.top - boundaryTop - 8 - maxHeight
        : anchor.bottom - boundaryTop + 8;
      popover.style.position = dialog ? "absolute" : "fixed";
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      popover.style.width = `${width}px`;
      popover.style.maxHeight = `${maxHeight}px`;
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };
    updatePosition();
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, true);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleUpdate);
    if (rootRef.current) observer?.observe(rootRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, true);
      observer?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      document.getElementById(`${listboxId}-${activeIndex}`)?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeIndex, listboxId, open]);

  const openPicker = () => {
    if (disabled) return;
    setPortalTarget(
      rootRef.current?.closest<HTMLElement>(".cw-modal") || document.body,
    );
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const closePicker = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseModel = (model: GatewayModel) => {
    if (disabled) return;
    onChange(model.id);
    setOpen(false);
    setManualEntryOpen(false);
    triggerRef.current?.focus();
  };

  const importExactModelId = () => {
    if (disabled || !manualIdValid) return;
    onChange(trimmedManualId);
    setOpen(false);
    setManualEntryOpen(false);
    setSearch("");
    setManualId("");
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }
    if (disabled) return;
    if (event.target !== searchRef.current) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, visibleModels.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeModel) {
      event.preventDefault();
      chooseModel(activeModel);
    }
  };

  const filters: { id: PricingFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "free", label: "Free" },
    { id: "paid", label: "Paid" },
    { id: "unverified", label: "Unverified" },
  ];
  return (
    <div
      className="cw-model-selector"
      ref={rootRef}
      onKeyDown={handleKeyDown}
    >
      <span className="cw-model-selector-label">Model</span>
      <button
        ref={triggerRef}
        type="button"
        className="cw-model-trigger"
        aria-label={`${provider} model: ${selectedName || "choose a model"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openPicker()}
      >
        <span className="cw-model-trigger-icon"><Sparkles size={14} /></span>
        <span className="cw-model-trigger-copy">
          <strong>{selectedName || "Choose a model"}</strong>
          <small>
            {selected
              ? selected.id
              : value
                ? "Saved model ID · not in live catalog"
                : `${availableModels.length} live text models`}
          </small>
        </span>
        {selected && (
          <span className={`cw-model-price cw-model-price-${modelPricing(selected).toLowerCase()}`}>
            {modelPricingIcon(selected)} {modelPricing(selected)}
          </span>
        )}
        <ChevronDown size={15} className="cw-model-trigger-chevron" />
      </button>

      {open && portalTarget && createPortal(
        <div
          className="cw-model-popover"
          ref={popoverRef}
        >
          <div className="cw-model-popover-heading">
            <div>
              <strong>Choose a {provider} model</strong>
              <span>{availableModels.length} live text models · newest first</span>
            </div>
            {onRefresh && (
              <button
                type="button"
                className="cw-model-refresh"
                onClick={() => {
                  setActiveIndex(-1);
                  onRefresh();
                }}
                disabled={disabled || refreshing}
                aria-label={`Refresh ${provider} model catalog`}
                title="Refresh live catalog"
              >
                <RefreshCw size={13} className={refreshing ? "cw-refreshing" : ""} />
              </button>
            )}
            <button
              type="button"
              className="cw-model-refresh"
              onClick={closePicker}
              aria-label="Close model picker"
            >
              <X size={14} />
            </button>
          </div>

          <label className="cw-model-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              role="combobox"
              aria-label={`Search ${provider} models`}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              readOnly={disabled}
              aria-activedescendant={activeModel ? `${listboxId}-${activeIndex}` : undefined}
              placeholder="Search model name, route ID, or provider…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActiveIndex(-1);
              }}
            />
            {search && (
              <button
                type="button"
                className="cw-model-clear-search"
                aria-label="Clear model search"
                disabled={disabled}
                onClick={() => {
                  setSearch("");
                  setActiveIndex(-1);
                  searchRef.current?.focus();
                }}
              >
                <X size={13} />
              </button>
            )}
          </label>

          <div className="cw-model-filters" aria-label="Filter models by price">
            {filters.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={filter === item.id}
                disabled={disabled}
                onClick={() => {
                  setFilter(item.id);
                  setActiveIndex(-1);
                }}
              >
                {item.label}<span>{counts[item.id]}</span>
              </button>
            ))}
          </div>

          <div
            className="cw-model-results"
            role="listbox"
            id={listboxId}
            aria-label={`${provider} model catalog`}
          >
            {visibleModels.map((model, index) => {
              const isSelected = model.id === value;
              const isRecommended = recommendations.some(
                (recommendation) => recommendation.id === model.id,
              );
              return (
                <div
                  id={`${listboxId}-${index}`}
                  className={`cw-model-result${isSelected ? " is-selected" : ""}${activeIndex === index ? " is-active" : ""}`}
                  key={model.id}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={disabled}
                  onMouseEnter={() => { if (!disabled) setActiveIndex(index); }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { if (!disabled) chooseModel(model); }}
                >
                  <span className="cw-model-result-main">
                    <strong>{model.name || model.id}</strong>
                    <small>{model.id}{model.owned_by ? ` · ${model.owned_by}` : ""}</small>
                  </span>
                  <span className="cw-model-result-meta">
                    {isRecommended && <span className="cw-model-recommended"><Sparkles size={10} /> New</span>}
                    {isAutomaticModel(model) && <span className="cw-model-auto">Auto</span>}
                    <span className={`cw-model-price cw-model-price-${modelPricing(model).toLowerCase()}`}>
                      {modelPricingIcon(model)} {modelPricing(model)}
                    </span>
                    {isSelected && <Check size={14} className="cw-model-result-check" />}
                  </span>
                </div>
              );
            })}
            {visibleMatches.length === 0 && (
              <div className="cw-model-empty">
                <Search size={16} />
                <strong>No catalog matches</strong>
                <span>Try another search, refresh the catalog, or use the exact route ID.</span>
              </div>
            )}
          </div>

          {visibleMatches.length > MAX_VISIBLE_MODELS && (
            <p className="cw-model-results-hint">
              Showing {MAX_VISIBLE_MODELS} of {visibleMatches.length} matches. Refine your search to narrow the list.
            </p>
          )}

          <div className="cw-model-exact">
            {!manualEntryOpen ? (
              <button
                type="button"
                className="cw-model-exact-toggle"
                disabled={disabled}
                onClick={() => setManualEntryOpen(true)}
              >
                <WandSparkles size={13} />
                Can’t find it? Use an exact model ID
              </button>
            ) : (
              <div className="cw-model-exact-form">
                <label htmlFor={`${listboxId}-exact-id`}>Use an exact route ID</label>
                <div>
                  <input
                    id={`${listboxId}-exact-id`}
                    autoFocus
                    disabled={disabled}
                    value={manualId}
                    onChange={(event) => setManualId(event.target.value)}
                    placeholder="provider/model-name:free"
                    maxLength={256}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        importExactModelId();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={disabled || !manualIdValid}
                    onClick={importExactModelId}
                  >
                    Import model
                  </button>
                </div>
                <small>
                  The ID is sent directly through {provider}. It must be enabled by your gateway.
                  {!manualIdValid && manualId.length > 0 && " Use a model ID without spaces, up to 256 characters."}
                  {manualIdValid && isManualDuplicate && " This ID is also present in the live catalog."}
                </small>
              </div>
            )}
          </div>
        </div>,
        portalTarget,
      )}

      {recommendations.length > 0 && (
        <div className="cw-current-models">
          <span><Sparkles size={11} /> Recent model picks</span>
          <div>
            {recommendations.slice(0, 3).map((model) => (
              <button
                type="button"
                key={model.id}
                title={model.id}
                aria-pressed={value === model.id}
                disabled={disabled}
                onClick={() => { if (!disabled) onChange(model.id); }}
              >
                <strong>{model.name || model.id}</strong>
                <small>{modelPricing(model)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {provider === "OmniRoute" && (
        <p className="cw-model-cost-note">
          Select a route for Canvas agent runs, then save settings to apply it.
        </p>
      )}

      {selected && isPaidModel(selected) && (
        <p className="cw-model-cost-note">
          This route is paid. {provider === "Kilo"
            ? "A Kilo key and credits are required; Auto Free uses its own free model pool."
            : "Access and billing depend on your gateway account."}
        </p>
      )}
      {value && !selected && (
        <p className="cw-model-cost-note">
          This saved model ID is not in the live catalog. You can keep using it if the gateway supports it, or choose a listed route.
        </p>
      )}
    </div>
  );
}
