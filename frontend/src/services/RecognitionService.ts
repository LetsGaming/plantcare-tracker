import ApiUtils from "@/utils/apiUtils";
import { handleRequest, withoutErrorToasts } from "@/utils/requestFeedback";

const BASE_ENDPOINT = "/recognition";
const RESOURCE_KEY = "recognition.title";

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
    return handleRequest(
      ApiUtils.upload<MatchResult>(`${BASE_ENDPOINT}/match`, form),
      RESOURCE_KEY,
      "recognition.match",
    );
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
