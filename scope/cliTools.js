import Observer from '../utils/observer';
import TicksService from '../api/ticks_service';
import { generateDerivApiInstance } from '../api/appId';

export let $scope = {};

function CreateScope() {
    const observer = new Observer();
    const api = generateDerivApiInstance();
    const ticksService = new TicksService(api);

    return { observer, api, ticksService };
}

export function setInitialScope() {
    const scope = new CreateScope();
    scope.sessionRuns = 0;
    scope.sessionProfit = 0;
    $scope = scope;
}
