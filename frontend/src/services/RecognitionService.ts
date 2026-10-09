import ApiUtils from "@/utils/apiUtils";
import { handleRequest, withoutErrorToasts } from "@/utils/requestFeedback";
import { asApiError } from "@/utils/apiErrorMessage";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

const BASE_ENDPOINT = "/recognition";
const RESOURCE_KEY = "recognition.title";

const MATCH_FAILURE_KEYS: Record<number, string> = {
  400: "water.snap_unreadable",
  429: "water.snap_busy",
  503: "water.snap_unavailable",
};
const MATCH_FAILURE_FALLBACK = "recognition.match";

const RecognitionService = {
  async status(): Promise<boolean> {
    try {
      const result = await withoutErrorToasts(() =>
        ApiUtils.get<{ available: boolean }>(`${BASE_ENDPOINT}/status`),
      );
      return result.available;
    } catch {
      return false;
    }
  },

  async match(photo: File): Promise<MatchResult> {
    const form = new FormData();
    form.append("image", photo);
    try {
      return await withoutErrorToasts(() =>
        ApiUtils.upload<MatchResult>(`${BASE_ENDPOINT}/match`, form),
      );
    } catch (error) {
      const key = MATCH_FAILURE_KEYS[asApiError(error)?.status ?? 0] ?? MATCH_FAILURE_FALLBACK;
      ToastService.showError(localizationService.t(key, undefined, key));
      throw error;
    }
  },

  async confirm(snapshotId: string, body: ConfirmSnapshot): Promise<ConfirmResult> {
    return handleRequest(
      ApiUtils.post<ConfirmSnapshot, ConfirmResult>(
        `${BASE_ENDPOINT}/snapshots/${snapshotId}/confirm`,
        body,
      ),
      RESOURCE_KEY,
      "recognition.confirm",
    );
  },
};

export default RecognitionService;
