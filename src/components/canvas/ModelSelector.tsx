import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { GatewayModel } from "../../utils/gateways";
import {
  catalogModelLabel,
  currentModelRecommendations,
  isAutomaticModel,
  isFreeModel,
  isPaidModel,
  sortModelCatalog,
} from "../../utils/modelCatalog";

export function ModelSelector({
  provider,
  models,
  value,
  onChange,
}: {
  provider: string;
  models: GatewayModel[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const availableModels = useMemo(() => sortModelCatalog(models), [models]);
  const recommendations = useMemo(
    () => currentModelRecommendations(availableModels),
    [availableModels],
  );
  const recommendedIds = new Set(recommendations.map((model) => model.id));
  const matches = (model: GatewayModel) =>
    `${model.id} ${model.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase().trim());
  const automatic = availableModels.filter(
    (model) => isAutomaticModel(model) && matches(model),
  );
  const featured = recommendations.filter(matches);
  const remaining = availableModels.filter(
    (model) =>
      !isAutomaticModel(model) &&
      !recommendedIds.has(model.id) &&
      matches(model),
  );
  const selected = availableModels.find((model) => model.id === value);
  const option = (model: GatewayModel) => (
    <option key={model.id} value={model.id}>
      {catalogModelLabel(model)}
    </option>
  );
  return (
    <div className="cw-model-selector">
      <label>
        <span>Model</span>
        <select
          aria-label={`${provider} model`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose a model</option>
          {value && (!selected || !matches(selected)) && (
            <option value={value}>
              {selected
                ? catalogModelLabel(selected)
                : `${value} · ${models.length ? "not in live catalog" : "saved"}`}
            </option>
          )}
          {automatic.length > 0 && (
            <optgroup label="Automatic routing">
              {automatic.map(option)}
            </optgroup>
          )}
          {featured.length > 0 && (
            <optgroup label="Current models">{featured.map(option)}</optgroup>
          )}
          {remaining.length > 0 && (
            <optgroup label="All text models · newest first">
              {remaining.map(option)}
            </optgroup>
          )}
        </select>
      </label>
      {availableModels.length > 0 && (
        <>
          <label className="cw-model-search">
            <Search size={12} />
            <input
              aria-label={`Search ${provider} models`}
              placeholder="Search live models…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <small className="cw-catalog-count">
            {availableModels.length} live text models · newest first
          </small>
        </>
      )}
      {recommendations.length > 0 && (
        <div className="cw-current-models">
          <span>
            <Sparkles size={11} /> Current models
          </span>
          <div>
            {recommendations.slice(0, 3).map((model) => (
              <button
                type="button"
                key={model.id}
                title={model.id}
                aria-pressed={value === model.id}
                onClick={() => onChange(model.id)}
              >
                <strong>{model.name || model.id}</strong>
                <small>{isFreeModel(model) ? "Free" : isPaidModel(model) ? "Paid" : "Check pricing"}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {selected &&
        isPaidModel(selected) && (
          <p className="cw-model-cost-note">
            This route is paid.{" "}
            {provider === "Kilo"
              ? "A Kilo key and credits are required; Auto Free uses its own free model pool."
              : "Access and billing depend on your gateway account."}
          </p>
        )}
      {value && !selected && models.length > 0 && (
        <p className="cw-model-cost-note">
          Your saved model is no longer available in this catalog. Choose a current model before sending a prompt.
        </p>
      )}
      {availableModels.length > 0 &&
        !automatic.length &&
        !featured.length &&
        !remaining.length && (
          <p className="cw-model-cost-note">
            No catalog models match this search.
          </p>
        )}
    </div>
  );
}
