import { HomePage } from "./HomePage";
import type { PageContext } from "./page-types";

/**
 * Deprecated compatibility entry point.
 *
 * The app now renders HomePage directly for `/`, but keeping this named export
 * avoids breaking local extensions that imported the former startup route.
 */
export function StartupRoute(context: PageContext) {
  return <HomePage {...context} />;
}
