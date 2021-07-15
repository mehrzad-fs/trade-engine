import { localize } from '@deriv/translations';
import { proposalsReady, clearProposals as clearProposalsAction } from './state';
import { tradeOptionToProposal, doUntilDone, getUUID } from '../utils';
import { $scope } from '../scope';

let purchase_reference;

export const checkProposalReady = () => {
    // Proposals are considered ready when the proposals in our memory match the ones
    // we've requested from the API, we determine this by checking the passthrough of the response.
    const { proposals } = $scope.data;

    if (proposals.length > 0) {
        const has_equal_proposals = $scope.proposal_templates.every(template => {
            return (
                proposals.findIndex(proposal => {
                    return (
                        proposal.purchase_reference === template.passthrough.purchase_reference &&
                        proposal.contract_type === template.contract_type
                    );
                }) !== -1
            );
        });

        if (has_equal_proposals) {
            $scope.startPromise.then(() => $scope.store.dispatch(proposalsReady()));
        }
    }
};

export const clearProposals = () => {
    $scope.data.proposals = [];
    $scope.store.dispatch(clearProposalsAction());
};

export const getPurchaseReference = () => purchase_reference;

export const isNewTradeOption = trade_option => {
    if (!$scope.trade_option) {
        $scope.trade_option = trade_option;
        return true;
    }

    // Compare incoming "trade_option" argument with "$scope.trade_option", if any
    // of the values is different, $scope is a new tradeOption and new proposals
    // should be generated.
    return [
        'amount',
        'barrierOffset',
        'basis',
        'duration',
        'duration_unit',
        'prediction',
        'secondBarrierOffset',
        'symbol',
    ].some(value => $scope.trade_option[value] !== trade_option[value]);
};

export const makeProposals = trade_option => {
    if (!isNewTradeOption(trade_option)) {
        return;
    }

    // Generate a purchase reference when trade options are different from previous trade options.
    // This will ensure the bot doesn't mistakenly purchase the wrong proposal.
    regeneratePurchaseReference();
    $scope.trade_option = trade_option;
    $scope.proposal_templates = tradeOptionToProposal(trade_option, getPurchaseReference());
    renewProposalsOnPurchase();
};

export const observeProposals = () => {
    $scope.api.onMessage().subscribe(response => {
        if (response.data.msg_type === 'proposal') {
            const { passthrough, proposal } = response.data;
            if (
                proposal &&
                $scope.data.proposals.findIndex(p => p.id === proposal.id) === -1 &&
                !$scope.data.forget_proposal_ids.includes(proposal.id)
            ) {
                // Add proposals based on the ID returned by the API.
                $scope.data.proposals.push({ ...proposal, ...passthrough });
                checkProposalReady();
            }
        }
    });
};

export const regeneratePurchaseReference = () => {
    purchase_reference = getUUID();
};

export const renewProposalsOnPurchase = () => {
    unsubscribeProposals().then(() => requestProposals());
};

export const requestProposals = () => {
    // Since there are two proposals (in most cases), an error may be logged twice, to avoid this
    // flip this boolean on error.
    let has_informed_error = false;

    Promise.all(
        $scope.proposal_templates.map(proposal => {
            doUntilDone(() => $scope.api.send(proposal)).catch(error => {
                // We intercept ContractBuyValidationError as user may have specified
                // e.g. a DIGITUNDER 0 or DIGITOVER 9, while one proposal may be invalid
                // the other is valid. We will error on Purchase rather than here.

                if (error.error.code === 'ContractBuyValidationError') {
                    $scope.data.proposals.push({
                        ...error.error.echo_req,
                        ...error.echo_req.passthrough,
                        error,
                    });

                    return null;
                }
                if (!has_informed_error) {
                    has_informed_error = true;
                    $scope.observer.emit('Error', error.error);
                }
                return null;
            });
        })
    );
};

export const selectProposal = contract_type => {
    const { proposals } = $scope.data;

    if (proposals.length === 0) {
        throw Error(localize('Proposals are not ready'));
    }

    const to_buy = proposals.find(proposal => {
        if (proposal.contract_type === contract_type && proposal.purchase_reference === getPurchaseReference()) {
            // Below happens when a user has had one of the proposals return
            // with a ContractBuyValidationError. We allow the logic to continue
            // to here cause the opposite proposal may still be valid. Only once
            // they attempt to purchase the errored proposal we will intervene.
            if (proposal.error) {
                throw proposal.error;
            }

            return proposal;
        }

        return false;
    });

    if (!to_buy) {
        throw new Error(localize('Selected proposal does not exist'));
    }

    return {
        id: to_buy.id,
        askPrice: to_buy.ask_price,
    };
};

export const unsubscribeProposals = () => {
    const { proposals } = $scope.data;
    const removeForgetProposalById = forget_proposal_id =>
        ($scope.data.forget_proposal_ids = $scope.data.forget_proposal_ids.filter(id => id !== forget_proposal_id));

    clearProposals();

    return Promise.all(
        proposals.map(proposal => {
            if (!$scope.data.forget_proposal_ids.includes(proposal.id)) {
                $scope.data.forget_proposal_ids.push(proposal.id);
            }

            if (proposal.error) {
                removeForgetProposalById(proposal.id);
                return Promise.resolve();
            }

            return doUntilDone(() => $scope.api.forget(proposal.id)).then(() => {
                removeForgetProposalById(proposal.id);
            });
        })
    );
};
